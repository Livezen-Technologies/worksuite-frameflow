// Upload queue (SRS CL-08): every cloud upload shows here with its
// progress and can be paused and resumed; an optional bandwidth limit
// paces all uploads. Pausing aborts the part in flight; uploads are
// resumable by part, so resuming carries on from the last finished part.
const network = require("./network");

const items = new Map();
const listeners = new Set();
let nextId = 1;
let lastEmit = 0;
let emitTimer = null;

function snapshot() {
	return [...items.values()].map(({ waiters, controller, ...item }) => item);
}

function emit({ force = false } = {}) {
	const send = () => {
		lastEmit = Date.now();
		emitTimer = null;
		const list = snapshot();
		for (const listener of listeners) listener(list);
	};
	if (force || Date.now() - lastEmit > 250) return send();
	if (!emitTimer) emitTimer = setTimeout(send, 250);
}

function onChange(listener) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

// Pacing shared by all uploads: the next part may start once the bytes
// already sent fit under the limit.
let paceUntil = 0;
async function pace(bytes) {
	const limit = network.getState().bandwidthLimit;
	if (!limit) return;
	const now = Date.now();
	const start = Math.max(now, paceUntil);
	paceUntil = start + (bytes / limit) * 1000;
	const wait = paceUntil - now - (bytes / limit) * 1000;
	if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

function begin({ name, size, purpose }) {
	const item = {
		id: String(nextId++),
		name: String(name),
		size: Number(size) || 0,
		purpose: String(purpose ?? "upload"),
		sent: 0,
		state: "uploading",
		error: null,
		startedAt: Date.now(),
		waiters: [],
		controller: new AbortController(),
	};
	items.set(item.id, item);
	emit({ force: true });

	const setState = (state, error = null) => {
		item.state = state;
		item.error = error;
		emit({ force: true });
	};

	return {
		id: item.id,
		/** Aborted when the user pauses this upload. */
		get pauseSignal() {
			return item.controller.signal;
		},
		isPaused: () => item.state === "paused",
		/** Resolves when the upload may send (not paused, not offline). */
		async gate() {
			while (item.state === "paused" || network.isOffline()) {
				if (network.isOffline() && item.state !== "paused") setState("waiting");
				await new Promise((resolve) => {
					item.waiters.push(resolve);
					if (network.isOffline()) setTimeout(resolve, 2000);
				});
			}
			if (item.state !== "uploading") setState("uploading");
		},
		pace,
		progress(sent) {
			item.sent = Math.min(item.size, sent);
			emit();
		},
		done() {
			item.sent = item.size;
			setState("done");
			setTimeout(() => {
				items.delete(item.id);
				emit({ force: true });
			}, 8000);
		},
		fail(error) {
			setState(error?.code === "cancelled" ? "cancelled" : "error", error?.message ?? String(error));
			setTimeout(() => {
				items.delete(item.id);
				emit({ force: true });
			}, 30000);
		},
	};
}

function pause(id) {
	const item = items.get(String(id));
	if (!item || (item.state !== "uploading" && item.state !== "waiting")) return snapshot();
	item.state = "paused";
	item.controller.abort();
	item.controller = new AbortController();
	emit({ force: true });
	return snapshot();
}

function resume(id) {
	const item = items.get(String(id));
	if (!item || item.state !== "paused") return snapshot();
	item.state = "uploading";
	for (const wake of item.waiters.splice(0)) wake();
	emit({ force: true });
	return snapshot();
}

function pauseAll() {
	for (const id of items.keys()) pause(id);
	return snapshot();
}

function resumeAll() {
	for (const id of items.keys()) resume(id);
	return snapshot();
}

/** Wakes uploads that were waiting for the network. */
network.onChange(() => {
	for (const item of items.values()) for (const wake of item.waiters.splice(0)) wake();
});

module.exports = { begin, pause, resume, pauseAll, resumeAll, onChange, list: snapshot };
