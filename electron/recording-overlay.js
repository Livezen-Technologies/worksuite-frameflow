// Recording overlay (CT-R4): a transparent, click-through window over the
// recorded display that IS captured. It shows a ripple where you click,
// the keys you press (shortcuts and special keys; plain typing only as
// "typing", never the letters), and covers windows marked private.
const { BrowserWindow, screen, desktopCapturer } = require("electron");
const path = require("node:path");
const inputHook = require("./input-hook");
const privacy = require("./privacy");

const SPECIAL = new Set(["Enter", "Escape", "Tab", "Backspace", "Delete", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "Insert", "CapsLock"]);
const MODIFIERS = new Set([29, 3613, 42, 54, 56, 3640, 3675, 3676]);

let win = null;
let options = null;
let display = null;
let maskTimer = null;
let paused = false;
let typingAt = 0;

const send = (channel, payload) => win && !win.isDestroyed() && win.webContents.send(channel, payload);

function toLocal({ x, y }) {
	// uiohook reports physical pixels on Windows/Linux, points on macOS.
	const scale = process.platform === "darwin" ? 1 : display.scaleFactor || 1;
	return { x: x / scale - display.bounds.x, y: y / scale - display.bounds.y };
}

const handlers = {
	mousemove: (e) => {
		if (paused || !options?.halo) return;
		send("overlay:move", toLocal(e));
	},
	mousedown: (e) => {
		if (paused || !options?.clicks) return;
		send("overlay:click", { ...toLocal(e), button: e.button });
	},
	keydown: (e) => {
		if (paused || !options?.keys || MODIFIERS.has(e.keycode)) return;
		const name = inputHook.keyName(e.keycode) ?? "";
		const combo = e.ctrlKey || e.metaKey || e.altKey;
		if (combo || SPECIAL.has(name) || /^F\d+$/.test(name)) {
			const mods = [e.ctrlKey && "Ctrl", e.metaKey && (process.platform === "darwin" ? "⌘" : "Win"), e.altKey && (process.platform === "darwin" ? "⌥" : "Alt"), e.shiftKey && "Shift"].filter(Boolean);
			send("overlay:key", [...mods, name].join(" + "));
		} else if (Date.now() - typingAt > 1500) {
			typingAt = Date.now();
			send("overlay:key", "Typing…");
		}
	},
};

async function displayFor(sourceId) {
	if (sourceId?.startsWith("screen:")) {
		const sources = await desktopCapturer.getSources({ types: ["screen"] });
		const source = sources.find((s) => s.id === sourceId);
		const found = screen.getAllDisplays().find((d) => String(d.id) === String(source?.display_id));
		if (found) return found;
	}
	return screen.getPrimaryDisplay();
}

async function updateMasks() {
	if (!win || !options?.privatePatterns?.length) return;
	const windows = await privacy.privateWindows(options.privatePatterns).catch(() => []);
	const b = display.bounds;
	send(
		"overlay:masks",
		paused ? [] : windows.map((w) => ({ name: w.name, x: w.x - b.x, y: w.y - b.y, width: w.width, height: w.height })),
	);
}

module.exports = {
	displayFor,
	/** Opens the overlay for a take. Returns what it can do on this system. */
	async start({ sourceId, keys = true, clicks = true, privatePatterns = [], halo = false, clickColor = "#ffc400", clickSize = 56 } = {}) {
		module.exports.stop();
		options = { keys, clicks, privatePatterns, halo };
		paused = false;
		display = await displayFor(sourceId);
		win = new BrowserWindow({
			...display.bounds,
			frame: false,
			transparent: true,
			resizable: false,
			movable: false,
			focusable: false,
			alwaysOnTop: true,
			skipTaskbar: true,
			hasShadow: false,
			enableLargerThanScreen: true,
			show: false,
			webPreferences: { preload: path.join(__dirname, "overlay", "overlay-preload.js"), contextIsolation: true, sandbox: true },
		});
		win.setIgnoreMouseEvents(true);
		win.setAlwaysOnTop(true, "screen-saver");
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
		await win.loadFile(path.join(__dirname, "overlay", "overlay.html"));
		send("overlay:style", {
			clickColor: /^#[0-9a-f]{6}$/i.test(clickColor) ? clickColor : "#ffc400",
			clickSize: Math.min(160, Math.max(24, Number(clickSize) || 56)),
		});
		win.showInactive();
		const hooked = (keys || clicks || halo) && inputHook.acquire(handlers);
		options.hooked = hooked;
		if (privatePatterns.length) {
			await updateMasks();
			maskTimer = setInterval(() => void updateMasks(), 700);
		}
		return { input: !!hooked, masks: privatePatterns.length > 0 };
	},

	setPaused(on) {
		paused = !!on;
		void updateMasks();
	},

	stop() {
		if (maskTimer) clearInterval(maskTimer);
		maskTimer = null;
		if (options?.hooked) inputHook.release(handlers);
		options = null;
		if (win && !win.isDestroyed()) win.close();
		win = null;
	},
};
