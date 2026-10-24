// One global input hook (uiohook-napi) shared by the cursor log and the
// recording overlay: each user starts it, and it stops when the last one
// is done, so one can't switch the other off mid-take.
let hook = null;
try {
	hook = require("uiohook-napi");
} catch {
	hook = null;
}

let users = 0;

/**
 * macOS aborts the whole app if the hook starts without Accessibility access,
 * so there we ask once and only start it after the user allows it.
 */
function allowed() {
	if (process.platform !== "darwin") return true;
	try {
		const { systemPreferences } = require("electron");
		return systemPreferences.isTrustedAccessibilityClient(true);
	} catch {
		return false;
	}
}

function acquire(handlers) {
	if (!hook || !allowed()) return false;
	for (const [event, fn] of Object.entries(handlers)) hook.uIOhook.on(event, fn);
	if (users++ === 0) {
		try {
			hook.uIOhook.start();
		} catch {
			// No permission (macOS Accessibility): no events.
		}
	}
	return true;
}

function release(handlers) {
	if (!hook) return;
	for (const [event, fn] of Object.entries(handlers)) hook.uIOhook.off(event, fn);
	users = Math.max(0, users - 1);
	if (users === 0) {
		try {
			hook.uIOhook.stop();
		} catch {
			// Already stopped.
		}
	}
}

function keyName(keycode) {
	if (!hook) return null;
	const entry = Object.entries(hook.UiohookKey).find(([, code]) => code === keycode);
	return entry ? entry[0] : `Key${keycode}`;
}

module.exports = { available: () => !!hook, acquire, release, keyName };
