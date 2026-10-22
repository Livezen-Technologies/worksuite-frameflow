// Auto-update from the Worksuite download center (SRS DP auto-update).
// The download center hosts the installers and electron-builder's
// latest*.yml feed files per channel:
//   <WSC_UPDATE_URL>/<channel>/latest.yml        (Windows)
//   <WSC_UPDATE_URL>/<channel>/latest-linux.yml  (Linux AppImage)
//   <WSC_UPDATE_URL>/<channel>/latest-mac.yml    (macOS)
// Windows and AppImage builds download in the background and install on
// restart. Ad-hoc-signed macOS builds can't self-install (Squirrel.Mac
// needs a Developer ID signature), so they show the update and open the
// download center instead; .deb installs are updated the same way.
const { app, shell, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const FEED_BASE = process.env.WSC_UPDATE_URL || "https://download.worksuitecloud.com/frameflow";
const DOWNLOAD_PAGE = process.env.WSC_DOWNLOAD_PAGE || "https://worksuitecloud.com/download/frameflow";
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
const CHANNELS = ["stable", "beta"];

const settingsFile = () => path.join(app.getPath("userData"), "updates.json");

function readSettings() {
	try {
		const saved = JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
		return { channel: CHANNELS.includes(saved.channel) ? saved.channel : "stable", auto: saved.auto !== false };
	} catch {
		return { channel: "stable", auto: true };
	}
}

/** Can this build replace itself? (NSIS on Windows, AppImage on Linux.) */
function canSelfInstall() {
	if (!app.isPackaged) return false;
	if (process.platform === "win32") return true;
	if (process.platform === "linux") return !!process.env.APPIMAGE;
	return false;
}

let updater = null;
let timer = null;
let state = {
	status: "idle", // idle | checking | available | downloading | ready | up-to-date | error | unsupported
	currentVersion: app.getVersion(),
	version: null,
	notes: null,
	progress: 0,
	error: null,
	selfInstall: false,
	...readSettings(),
	downloadPage: DOWNLOAD_PAGE,
	checkedAt: null,
};

function setState(next) {
	state = { ...state, ...next };
	for (const win of BrowserWindow.getAllWindows()) win.webContents.send("updates:changed", state);
}

function feedUrl() {
	return `${FEED_BASE}/${state.channel}`;
}

function getUpdater() {
	if (updater) return updater;
	// Loaded lazily so a dev run without the package still starts.
	const { autoUpdater } = require("electron-updater");
	autoUpdater.autoDownload = false;
	autoUpdater.autoInstallOnAppQuit = true;
	autoUpdater.allowPrerelease = state.channel === "beta";
	autoUpdater.logger = null;
	autoUpdater.on("checking-for-update", () => setState({ status: "checking", error: null }));
	autoUpdater.on("update-not-available", () =>
		setState({ status: "up-to-date", checkedAt: Date.now() }),
	);
	autoUpdater.on("update-available", (info) => {
		setState({
			status: "available",
			version: info.version,
			notes: typeof info.releaseNotes === "string" ? info.releaseNotes : null,
			checkedAt: Date.now(),
		});
		if (state.selfInstall && state.auto) download();
	});
	autoUpdater.on("download-progress", (p) =>
		setState({ status: "downloading", progress: Math.round(p.percent) / 100 }),
	);
	autoUpdater.on("update-downloaded", (info) =>
		setState({ status: "ready", version: info.version, progress: 1 }),
	);
	autoUpdater.on("error", (error) =>
		setState({ status: "error", error: String(error?.message ?? error).split("\n")[0] }),
	);
	updater = autoUpdater;
	return updater;
}

/** Newer if any dotted number is higher (pre-release tags compare after). */
function isNewer(remote, local) {
	const parse = (v) => String(v).replace(/^v/, "").split(/[.-]/);
	const a = parse(remote);
	const b = parse(local);
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const x = Number.parseInt(a[i] ?? "0", 10);
		const y = Number.parseInt(b[i] ?? "0", 10);
		if (Number.isNaN(x) || Number.isNaN(y)) return false;
		if (x !== y) return x > y;
	}
	return false;
}

function feedFileName() {
	if (process.platform === "darwin") return "latest-mac.yml";
	if (process.platform === "win32") return "latest.yml";
	return "latest-linux.yml";
}

/** For builds that can't self-install: read the feed and just report. */
async function checkFeedOnly() {
	setState({ status: "checking", error: null });
	const res = await fetch(`${feedUrl()}/${feedFileName()}`, { cache: "no-store" });
	if (!res.ok) throw new Error(`The download center returned ${res.status}`);
	const text = await res.text();
	const version = /^version:\s*['"]?([^'"\s]+)/m.exec(text)?.[1];
	if (!version) throw new Error("The update feed has no version");
	setState(
		isNewer(version, app.getVersion())
			? { status: "available", version, checkedAt: Date.now() }
			: { status: "up-to-date", checkedAt: Date.now() },
	);
}

async function check() {
	if (!app.isPackaged) {
		setState({ status: "unsupported", error: "Updates work in the installed app only." });
		return state;
	}
	if (!state.selfInstall) {
		try {
			await checkFeedOnly();
		} catch (error) {
			setState({ status: "error", error: String(error?.message ?? error).split("\n")[0] });
		}
		return state;
	}
	try {
		const u = getUpdater();
		u.allowPrerelease = state.channel === "beta";
		u.setFeedURL({ provider: "generic", url: feedUrl(), channel: "latest" });
		await u.checkForUpdates();
	} catch (error) {
		setState({ status: "error", error: String(error?.message ?? error).split("\n")[0] });
	}
	return state;
}

async function download() {
	if (!state.selfInstall) {
		// macOS ad-hoc builds and .deb: get the new installer from the download center.
		await shell.openExternal(`${DOWNLOAD_PAGE}?channel=${state.channel}`);
		return state;
	}
	try {
		setState({ status: "downloading", progress: 0 });
		await getUpdater().downloadUpdate();
	} catch (error) {
		setState({ status: "error", error: String(error?.message ?? error).split("\n")[0] });
	}
	return state;
}

function install() {
	if (state.status === "ready" && updater) updater.quitAndInstall(false, true);
}

function configure({ channel, auto } = {}) {
	const next = {
		channel: CHANNELS.includes(channel) ? channel : state.channel,
		auto: typeof auto === "boolean" ? auto : state.auto,
	};
	fs.writeFileSync(settingsFile(), JSON.stringify(next));
	setState({ ...next, status: "idle", version: null });
	schedule();
	return state;
}

function schedule() {
	if (timer) clearInterval(timer);
	if (!state.auto) return;
	timer = setInterval(() => void check(), CHECK_EVERY_MS);
}

function init() {
	setState({ selfInstall: canSelfInstall(), ...readSettings() });
	schedule();
	// First check shortly after start, so it never slows the launch.
	if (state.auto) setTimeout(() => void check(), 15_000);
}

module.exports = {
	isNewer,
	init,
	check,
	download,
	install,
	configure,
	getState: () => state,
};
