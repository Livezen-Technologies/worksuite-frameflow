const { BrowserWindow, ipcMain, screen } = require("electron");

/**
 * Projects in their own windows (SRS MP-04, MP-08): open a project in a
 * new window for a second monitor, move it back to the main window, and
 * never have one project open in two windows at once.
 */

let main = null;
let makeWindow = null;
let origin = "";
/** webContents id → project id shown there. */
const showing = new Map();

function windowShowing(projectId, except) {
	for (const [id, project] of showing) {
		if (project !== projectId || id === except) continue;
		const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.id === id);
		if (win) return win;
		showing.delete(id);
	}
	return null;
}

function focus(win) {
	if (win.isMinimized()) win.restore();
	win.show();
	win.focus();
}

module.exports = {
	init({ window, create, appOrigin }) {
		main = window;
		makeWindow = create;
		origin = appOrigin;
		main.on("closed", () => {
			main = null;
		});
	},

	/** The page says which project it shows; false means another window has it. */
	report(event, { projectId } = {}) {
		const id = event.sender.id;
		if (!projectId) {
			showing.delete(id);
			return { ok: true };
		}
		const other = windowShowing(String(projectId), id);
		if (other) {
			focus(other);
			return { ok: false };
		}
		showing.set(id, String(projectId));
		return { ok: true };
	},

	async open(_event, { projectId, at } = {}) {
		const id = String(projectId ?? "");
		if (!id || !makeWindow) return { opened: false };
		const existing = windowShowing(id);
		if (existing) {
			focus(existing);
			return { opened: false, focused: true };
		}
		const win = makeWindow();
		// A tab dragged out of the window: put the new window where it was dropped.
		if (Number.isFinite(at?.x) && Number.isFinite(at?.y)) {
			const area = screen.getDisplayNearestPoint({ x: Math.round(at.x), y: Math.round(at.y) }).workArea;
			const [width, height] = win.getSize();
			const x = Math.min(Math.max(area.x, Math.round(at.x - width / 2)), area.x + area.width - Math.min(width, area.width));
			const y = Math.min(Math.max(area.y, Math.round(at.y - 20)), area.y + area.height - Math.min(height, area.height));
			win.setPosition(x, y);
		}
		win.on("closed", () => {
			for (const [key] of showing) if (BrowserWindow.getAllWindows().every((w) => w.webContents.id !== key)) showing.delete(key);
		});
		showing.set(win.webContents.id, id);
		await win.loadURL(`${origin}/editor/${encodeURIComponent(id)}`);
		return { opened: true };
	},

	/** From a project window: show the project in the main window and close this one. */
	moveToMain(event, { projectId } = {}) {
		if (!main || main.isDestroyed()) return { moved: false };
		const sender = BrowserWindow.fromWebContents(event.sender);
		if (!sender || sender === main) return { moved: false };
		showing.delete(event.sender.id);
		sender.close();
		main.webContents.send("windows:navigate", `/editor/${encodeURIComponent(String(projectId))}`);
		focus(main);
		return { moved: true };
	},

	/** Main window: a tab was dragged in from a project window; close that window. */
	take(event, { projectId } = {}) {
		if (!main || event.sender.id !== main.webContents.id) return { taken: false };
		const id = String(projectId ?? "");
		const win = id && windowShowing(id, main.webContents.id);
		if (!win) return { taken: false };
		showing.delete(win.webContents.id);
		win.close();
		return { taken: true };
	},

	isMain(event) {
		return !!main && event.sender.id === main.webContents.id;
	},

	_ipc() {
		// Registered by main.js through its trusted-sender handler.
		return ipcMain;
	},
};
