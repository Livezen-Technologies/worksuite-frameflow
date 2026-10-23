const { screen, desktopCapturer } = require("electron");

/**
 * Cursor and click log for screen recordings (SRS SC-06, SC-07). Samples
 * the pointer at 30 Hz and records clicks and keyboard activity as data,
 * so zooms and cursor effects can be changed after recording. Privacy:
 * plain typing is logged only as "typing happened" (no key); only
 * shortcut combinations (Ctrl/Cmd/Alt + key) are named.
 * Positions are 0–1 within the recorded display.
 */

let hook = null;
try {
	// Native global input hook; without it the log has cursor movement only.
	hook = require("uiohook-napi");
} catch {
	hook = null;
}

const SAMPLE_MS = 1000 / 30;
let session = null;

function now() {
	return performance.now();
}

/** Seconds recorded so far, not counting pauses (matches the page's clock). */
function elapsed(s) {
	const end = s.pausedAt ?? now();
	return Math.max(0, (end - s.startedAt - s.pausedTotal) / 1000);
}

function normalise(s, point) {
	const b = s.bounds;
	return [
		Math.round(((point.x - b.x) / b.width) * 10000) / 10000,
		Math.round(((point.y - b.y) / b.height) * 10000) / 10000,
	];
}

async function displayFor(sourceId) {
	if (sourceId?.startsWith("screen:")) {
		const sources = await desktopCapturer.getSources({ types: ["screen"] });
		const source = sources.find((s) => s.id === sourceId);
		const display = screen.getAllDisplays().find((d) => String(d.id) === String(source?.display_id));
		if (display) return display;
	}
	// Windows and unknown sources: the display the cursor is on.
	return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

const MODIFIER_KEYS = new Set([29, 3613, 42, 54, 56, 3640, 3675, 3676]); // ctrl, shift, alt, meta (both sides)

function keyName(event) {
	if (!hook) return null;
	const entry = Object.entries(hook.UiohookKey).find(([, code]) => code === event.keycode);
	return entry ? entry[0] : `Key${event.keycode}`;
}

function onMouseDown(event) {
	const s = session;
	if (!s || s.pausedAt !== null) return;
	const [x, y] = normalise(s, { x: event.x / s.scale, y: event.y / s.scale });
	s.clicks.push([Math.round(elapsed(s) * 1000) / 1000, x, y, event.button]);
}

function onKeyDown(event) {
	const s = session;
	if (!s || s.pausedAt !== null || MODIFIER_KEYS.has(event.keycode)) return;
	const t = Math.round(elapsed(s) * 1000) / 1000;
	const combo = event.ctrlKey || event.metaKey || event.altKey;
	if (combo) {
		const mods = [event.ctrlKey && "Ctrl", event.metaKey && (process.platform === "darwin" ? "Cmd" : "Win"), event.altKey && "Alt", event.shiftKey && "Shift"].filter(Boolean);
		s.keys.push([t, [...mods, keyName(event)].join(" + ")]);
	} else {
		// Typing: where and when only, never which key.
		const [x, y] = normalise(s, screen.getCursorScreenPoint());
		s.typing.push([t, x, y]);
	}
}

module.exports = {
	available: () => ({ cursor: true, clicks: !!hook, keys: !!hook }),

	async start({ sourceId } = {}) {
		await module.exports.stop().catch(() => {});
		const display = await displayFor(sourceId);
		session = {
			bounds: display.bounds,
			// uiohook reports physical pixels on Windows/Linux, points on macOS.
			scale: process.platform === "darwin" ? 1 : display.scaleFactor || 1,
			startedAt: now(),
			pausedAt: null,
			pausedTotal: 0,
			samples: [],
			clicks: [],
			keys: [],
			typing: [],
			timer: null,
		};
		const s = session;
		s.timer = setInterval(() => {
			if (s.pausedAt !== null) return;
			const [x, y] = normalise(s, screen.getCursorScreenPoint());
			const last = s.samples[s.samples.length - 1];
			// Skip unchanged positions; the gap itself says "still".
			if (last && last[1] === x && last[2] === y) return;
			s.samples.push([Math.round(elapsed(s) * 1000) / 1000, x, y]);
		}, SAMPLE_MS);
		if (hook) {
			hook.uIOhook.on("mousedown", onMouseDown);
			hook.uIOhook.on("keydown", onKeyDown);
			try {
				hook.uIOhook.start();
			} catch {
				// No permission (macOS Accessibility): cursor only.
			}
		}
		return module.exports.available();
	},

	pause() {
		if (session && session.pausedAt === null) session.pausedAt = now();
	},

	resume() {
		if (session && session.pausedAt !== null) {
			session.pausedTotal += now() - session.pausedAt;
			session.pausedAt = null;
		}
	},

	async stop() {
		const s = session;
		session = null;
		if (!s) return null;
		clearInterval(s.timer);
		if (hook) {
			hook.uIOhook.off("mousedown", onMouseDown);
			hook.uIOhook.off("keydown", onKeyDown);
			try {
				hook.uIOhook.stop();
			} catch {
				// Already stopped.
			}
		}
		return {
			version: 1,
			display: { width: s.bounds.width, height: s.bounds.height },
			samples: s.samples,
			clicks: s.clicks,
			keys: s.keys,
			typing: s.typing,
		};
	},
};
