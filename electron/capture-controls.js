const { BrowserWindow, globalShortcut, ipcMain, screen } = require("electron");
const path = require("node:path");

/**
 * Floating control bar (SC-04) and global recording shortcuts (SC-05).
 * Both turn into "capture:command" messages for the editor window, which
 * owns the recording. The bar is hidden from screen capture.
 */

const COMMANDS = new Set(["toggle", "toggle-pause", "marker", "stop", "discard", "toggle-mic", "toggle-camera"]);
const DEFAULT_SHORTCUTS = {
	toggle: "CommandOrControl+Shift+R",
	"toggle-pause": "CommandOrControl+Shift+P",
	marker: "CommandOrControl+Shift+M",
};

let bar = null;
let editor = null;
let shortcuts = { ...DEFAULT_SHORTCUTS };

function send(command) {
	if (!COMMANDS.has(command)) return;
	const target = editor && !editor.isDestroyed() ? editor : BrowserWindow.getAllWindows().find((w) => w !== bar);
	target?.webContents.send("capture:command", command);
}

ipcMain.on("capture-bar:command", (event, command) => {
	if (!bar || event.sender !== bar.webContents) return;
	if (command === "toggle-pen") togglePen();
	else if (command === "clear-pen") pen?.webContents.send("pen:clear");
	else send(command);
});

// Draw-on-screen pen (SC-04): a transparent window over the screen that IS
// captured, unlike the bar. While it's open, the mouse draws instead of
// clicking; Esc or the bar's Pen button closes it and clears the ink.
let pen = null;
let lastState = {};

function togglePen() {
	if (pen && !pen.isDestroyed()) {
		pen.close();
		return;
	}
	const display = screen.getPrimaryDisplay();
	pen = new BrowserWindow({
		...display.bounds,
		frame: false,
		transparent: true,
		resizable: false,
		movable: false,
		alwaysOnTop: true,
		skipTaskbar: true,
		hasShadow: false,
		enableLargerThanScreen: true,
		show: false,
		webPreferences: {
			preload: path.join(__dirname, "capture-bar", "pen-preload.js"),
			contextIsolation: true,
			sandbox: true,
		},
	});
	pen.setAlwaysOnTop(true, "pop-up-menu");
	pen.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	pen.loadFile(path.join(__dirname, "capture-bar", "pen.html"));
	pen.once("ready-to-show", () => {
		pen?.show();
		// The bar stays above the ink so it can still be clicked.
		bar?.moveTop();
	});
	pen.on("closed", () => {
		pen = null;
		updateBarState();
	});
	updateBarState();
}

ipcMain.on("pen:close", (event) => {
	if (pen && event.sender === pen.webContents) pen.close();
});

function updateBarState() {
	if (bar && !bar.isDestroyed())
		bar.webContents.send("capture-bar:state", { ...lastState, pen: !!(pen && !pen.isDestroyed()) });
}

function registerShortcuts() {
	globalShortcut.unregisterAll();
	const failed = [];
	for (const [command, accelerator] of Object.entries(shortcuts)) {
		if (!accelerator) continue;
		try {
			if (!globalShortcut.register(accelerator, () => send(command))) failed.push(accelerator);
		} catch {
			failed.push(accelerator);
		}
	}
	return failed;
}

module.exports = {
	DEFAULT_SHORTCUTS,
	send,

	init({ window }) {
		editor = window;
		registerShortcuts();
	},

	/** Sends commands to this window (the recorder window while it's open). */
	setTarget(window) {
		editor = window;
	},

	/** Returns accelerators another app already holds. */
	setShortcuts(next) {
		shortcuts = { ...DEFAULT_SHORTCUTS };
		for (const key of Object.keys(DEFAULT_SHORTCUTS)) {
			if (typeof next?.[key] === "string") shortcuts[key] = next[key].slice(0, 60);
		}
		return { shortcuts, failed: registerShortcuts() };
	},

	showBar({ owner }) {
		editor = owner ?? editor;
		if (bar && !bar.isDestroyed()) return bar.showInactive();
		const work = screen.getPrimaryDisplay().workArea;
		const width = 640;
		bar = new BrowserWindow({
			width,
			height: 52,
			x: Math.round(work.x + (work.width - width) / 2),
			y: work.y + 16,
			frame: false,
			transparent: true,
			resizable: false,
			alwaysOnTop: true,
			skipTaskbar: true,
			focusable: true,
			show: false,
			webPreferences: {
				preload: path.join(__dirname, "capture-bar", "preload.js"),
				contextIsolation: true,
				sandbox: true,
			},
		});
		bar.setAlwaysOnTop(true, "screen-saver");
		// Keep the bar out of the recording (macOS and Windows honour this).
		bar.setContentProtection(true);
		bar.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
		bar.loadFile(path.join(__dirname, "capture-bar", "bar.html"));
		bar.once("ready-to-show", () => bar?.showInactive());
		bar.on("closed", () => {
			bar = null;
		});
	},

	updateBar(state) {
		lastState = state ?? {};
		updateBarState();
	},

	hideBar() {
		if (pen && !pen.isDestroyed()) pen.close();
		if (bar && !bar.isDestroyed()) bar.close();
		bar = null;
	},

	dispose() {
		globalShortcut.unregisterAll();
		module.exports.hideBar();
	},
};
