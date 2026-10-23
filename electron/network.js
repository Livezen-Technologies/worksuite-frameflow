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

module.exports = { getState, update, onChange, isOffline, assertOnline, guardSession, OfflineError };
