// Recording privacy (SRS SC-08): open window titles for the protected-window
// watch, and a Do not disturb switch for the length of a take.
const { desktopCapturer } = require("electron");
const { execFile } = require("node:child_process");

async function windowNames() {
	const sources = await desktopCapturer.getSources({
		types: ["window"],
		thumbnailSize: { width: 0, height: 0 },
		fetchWindowIcons: false,
	});
	return sources.map((s) => s.name);
}

const run = (cmd, args) =>
	new Promise((resolve) => execFile(cmd, args, { timeout: 4000 }, (error, stdout) => resolve(error ? null : String(stdout).trim())));

// What the system was set to before we turned notifications off, to put back.
let saved = null;

const platforms = {
	linux: {
		async read() {
			return run("gsettings", ["get", "org.gnome.desktop.notifications", "show-banners"]);
		},
		async write(value) {
			return (await run("gsettings", ["set", "org.gnome.desktop.notifications", "show-banners", value])) !== null;
		},
		off: "false",
	},
	win32: {
		key: "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\PushNotifications",
		async read() {
			const out = await run("reg", ["query", this.key, "/v", "ToastEnabled"]);
			const match = out?.match(/0x([0-9a-f]+)/i);
			return match ? String(Number.parseInt(match[1], 16)) : "1";
		},
		async write(value) {
			return (await run("reg", ["add", this.key, "/v", "ToastEnabled", "/t", "REG_DWORD", "/d", value, "/f"])) !== null;
		},
		off: "0",
	},
};

/** Returns whether notifications are now held back; macOS has no public switch for Focus. */
async function doNotDisturb(on) {
	const p = platforms[process.platform];
	if (!p) return { ok: false, reason: "unsupported" };
	if (on) {
		if (saved === null) saved = await p.read();
		if (saved === null) return { ok: false, reason: "unavailable" };
		return { ok: await p.write(p.off) };
	}
	if (saved === null) return { ok: true };
	const ok = await p.write(saved);
	saved = null;
	return { ok };
}

module.exports = { windowNames, doNotDisturb };
