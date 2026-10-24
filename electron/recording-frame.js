// Recording frame: a big count-in, then a thin red line around the screen or
// area being recorded. Content protection keeps it out of the video itself.
const { BrowserWindow } = require("electron");
const path = require("node:path");
const { displayFor } = require("./recording-overlay");

let win = null;

const send = (channel, payload) => win && !win.isDestroyed() && win.webContents.send(channel, payload);

module.exports = {
	/** `area` is fractions 0–1 of the display; null frames the whole screen. */
	async show({ sourceId = null, area = null } = {}) {
		module.exports.hide();
		const display = await displayFor(sourceId);
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
			webPreferences: { preload: path.join(__dirname, "frame", "frame-preload.js"), contextIsolation: true, sandbox: true },
		});
		win.setContentProtection(true);
		win.setIgnoreMouseEvents(true);
		win.setAlwaysOnTop(true, "screen-saver");
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
		await win.loadFile(path.join(__dirname, "frame", "frame.html"));
		send("frame:area", area);
		win.showInactive();
	},
	count(n) {
		send("frame:count", Number(n) || 0);
		// Linux can't keep a window out of a capture, so only the count-in shows there.
		if (!n && process.platform === "linux") module.exports.hide();
	},
	paused(on) {
		send("frame:paused", !!on);
	},
	hide() {
		if (win && !win.isDestroyed()) win.close();
		win = null;
	},
};
