// Offline mode (SRS CL-09): one switch that stops all network traffic from
// the app, except update checks while those are turned on. The page's own
// requests are cancelled at the session; the main process's cloud calls
// check `assertOnline` before they start.
const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const settingsFile = () => path.join(app.getPath("userData"), "network.json");
const listeners = new Set();
let settings = null;

function load() {
	if (settings) return settings;
	try {
		const saved = JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
		settings = {
			offline: !!saved.offline,
			bandwidthLimit: Number(saved.bandwidthLimit) || 0,
		};
	} catch {
		settings = { offline: false, bandwidthLimit: 0 };
	}
	return settings;
}

/**
 * What kind of connection is up (DL-06 "Wi-Fi/Ethernet only"): "cellular"
 * when the only active external links look like mobile data or a phone
 * hotspot over USB, otherwise "wifi-or-ethernet". Judged from interface
 * names, since desktop systems don't report metered connections reliably.
 */
const CELLULAR = /^(wwan|ppp|rmnet|ccmni|usb\d|rndis|enx[0-9a-f]{12}$)|cellular|mobile|wwan|iphone|android/i;
function connectionKind(interfaces = require("node:os").networkInterfaces()) {
	const active = Object.entries(interfaces)
		.filter(([, addrs]) => (addrs ?? []).some((a) => !a.internal && a.family === "IPv4"))
		.map(([name]) => name)
		.filter((name) => !/^(lo|docker|br-|veth|virbr|vmnet|vboxnet|tun|tap|utun|zt|tailscale|wg)/i.test(name));
	if (!active.length) return "offline";
	return active.every((name) => CELLULAR.test(name)) ? "cellular" : "wifi-or-ethernet";
}

function getState() {
	return { ...load() };
}

function update(patch) {
	settings = { ...load(), ...patch };
	fs.writeFileSync(settingsFile(), JSON.stringify(settings));
	for (const listener of listeners) listener(getState());
	return getState();
}

function onChange(listener) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

const isOffline = () => load().offline;

class OfflineError extends Error {
	constructor() {
		super("Offline mode is on. Turn it off to use Worksuite Cloud.");
		this.code = "offline";
	}
}

function assertOnline() {
	if (isOffline()) throw new OfflineError();
}

/** Lets the page reach only the app's own server while offline. */
function guardSession({ session, origin, allow = [] }) {
	session.webRequest.onBeforeRequest((details, callback) => {
		if (!isOffline()) return callback({});
		const url = details.url;
		const local =
			url.startsWith(origin) ||
			allow.some((prefix) => url.startsWith(prefix)) ||
			/^(devtools|chrome|chrome-extension|file|data|blob):/.test(url);
		callback({ cancel: !local });
	});
}

module.exports = {
	connectionKind, getState, update, onChange, isOffline, assertOnline, guardSession, OfflineError };
