// Shows that a recording is running outside the app: a red dot in the menu
// bar / system tray (click to stop or pause), the Dock badge on macOS and
// a taskbar overlay on Windows.
const { app, BrowserWindow, Menu, Tray, nativeImage } = require("electron");
const path = require("node:path");
const captureControls = require("./capture-controls");

let tray = null;
let timer = null;
let startedAt = 0;
let pausedNow = false;

const icon = () => nativeImage.createFromPath(path.join(__dirname, "frame", "rec-dot.png"));
const clock = (ms) => {
	const s = Math.floor(ms / 1000);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function refresh() {
	if (!tray) return;
	const label = pausedNow ? "Paused" : `Recording ${clock(Date.now() - startedAt)}`;
	tray.setToolTip(`FrameFlow: ${label}`);
	if (process.platform === "darwin") tray.setTitle(pausedNow ? " Paused" : ` ${clock(Date.now() - startedAt)}`);
	tray.setContextMenu(
		Menu.buildFromTemplate([
			{ label, enabled: false },
			{ type: "separator" },
			{ label: "Stop recording", click: () => captureControls.send("stop") },
			{ label: pausedNow ? "Resume" : "Pause", click: () => captureControls.send("toggle-pause") },
			{ label: "Add marker", click: () => captureControls.send("marker") },
		]),
	);
}

module.exports = {
	active: () => !!tray,
	show() {
		module.exports.hide();
		startedAt = Date.now();
		pausedNow = false;
		tray = new Tray(icon());
		refresh();
		timer = setInterval(refresh, 1000);
		if (process.platform === "darwin") app.dock?.setBadge("REC");
		if (process.platform === "win32") {
			for (const win of BrowserWindow.getAllWindows()) win.setOverlayIcon(icon(), "Recording");
		}
	},
	paused(on) {
		pausedNow = !!on;
		refresh();
	},
	hide() {
		if (timer) clearInterval(timer);
		timer = null;
		tray?.destroy();
		tray = null;
		if (process.platform === "darwin") app.dock?.setBadge("");
		if (process.platform === "win32") {
			for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.setOverlayIcon(null, "");
		}
	},
};
