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

function acquire(handlers) {
	if (!hook) return false;
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
