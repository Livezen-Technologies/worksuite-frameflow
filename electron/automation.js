const { app, BrowserWindow, ipcMain } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const account = require("./account");
const cloudSync = require("./cloud-sync");

/**
 * Local automation API (SRS AU-01–AU-03): newline-delimited JSON-RPC 2.0
 * on a Unix socket (Windows: named pipe). Off until the user turns it on.
 * The socket address and a random token are written to automation.json,
 * readable only by this user; every connection must send `auth` first.
 * Nothing here ever returns account tokens or API keys (AU-02).
 */

const VERSION = 1;
const settingsFile = () => path.join(app.getPath("userData"), "automation-settings.json");
const discoveryFile = () => path.join(app.getPath("userData"), "automation.json");
// Unix socket paths are limited to ~104 bytes; long profile paths fall
// back to a short, per-user name in the temp folder (still mode 0600).
const SOCKET_PATH_LIMIT = 100;
const socketPath = () => {
	if (process.platform === "win32")
		return `\\\\.\\pipe\\worksuite-frameflow-${process.env.USERNAME ?? "user"}`;
	const preferred = path.join(app.getPath("userData"), "automation.sock");
	if (Buffer.byteLength(preferred) <= SOCKET_PATH_LIMIT) return preferred;
	const hash = crypto.createHash("sha256").update(app.getPath("userData")).digest("hex").slice(0, 12);
	return path.join(require("node:os").tmpdir(), `wve-${process.getuid?.() ?? "u"}-${hash}.sock`);
};

let server = null;
let token = null;
let nextCall = 1;
const pending = new Map();
const listeners = new Set();

const MAX_LINE = 64 * 1024 * 1024;
const CALL_TIMEOUT = 30 * 60 * 1000; // exports can take a while

function readSettings() {
	try {
		return { enabled: false, ...JSON.parse(fs.readFileSync(settingsFile(), "utf8")) };
	} catch {
		return { enabled: false };
	}
}

function rpcError(code, message) {
	return Object.assign(new Error(message), { rpcCode: code });
}

function window() {
	const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && !w.webContents.getURL().includes("popout"));
	if (!win) throw rpcError(-32001, "The editor window isn't open");
	return win;
}

/** Ask the page to run a method (project, media, timeline, export). */
function callPage(method, params) {
	const win = window();
	const id = nextCall++;
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			pending.delete(id);
			reject(rpcError(-32002, `${method} timed out`));
		}, CALL_TIMEOUT);
		pending.set(id, { resolve, reject, timer });
		win.webContents.send("automation:call", { id, method, params });
	});
}

ipcMain.on("automation:reply", (_event, { id, result, error } = {}) => {
	const call = pending.get(id);
	if (!call) return;
	pending.delete(id);
	clearTimeout(call.timer);
	if (error) call.reject(rpcError(error.code ?? -32000, error.message ?? "Failed"));
	else call.resolve(result);
});

const publicAccount = () => {
	const { status, profile } = account.getState();
	return {
		status,
		signedIn: status === "signed-in",
		name: profile?.name ?? null,
		email: profile?.email ?? null,
		workspace: profile?.workspace?.name ?? profile?.workspaceName ?? null,
	};
};

const requireSignedIn = () => {
	if (account.getState().status !== "signed-in")
		throw rpcError(-32010, "Not signed in. Run `wve login` or sign in in the app.");
};

const MEDIA_LIMIT = 4 * 1024 * 1024 * 1024;
const MIME = {
	mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska",
	avi: "video/x-msvideo", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac",
	ogg: "audio/ogg", opus: "audio/opus", flac: "audio/flac", jpg: "image/jpeg", jpeg: "image/jpeg",
	png: "image/png", gif: "image/gif", webp: "image/webp", avif: "image/avif", svg: "image/svg+xml",
	heic: "image/heic", heif: "image/heif", hif: "image/heif",
};

/** Methods the main process answers itself; everything else goes to the page. */
const MAIN_METHODS = {
	"app.info": () => ({ name: app.getName(), version: app.getVersion(), api: VERSION, platform: process.platform }),
	"account.status": () => publicAccount(),
	"account.login": async () => {
		if (account.getState().status !== "signed-in") void account.signIn();
		return { started: true, message: "Finish signing in in your browser." };
	},
	"account.logout": async () => {
		await account.signOut();
		return publicAccount();
	},
	"cloud.list": async () => {
		requireSignedIn();
		const result = await cloudSync.run("listProjects", {});
		if (!result.ok) throw rpcError(-32011, result.message ?? "Cloud request failed");
		return result.data ?? result;
	},
	// Files are read here so the page never gets file-system access.
	"media.import": async ({ paths } = {}) => {
		if (!Array.isArray(paths) || !paths.length) throw rpcError(-32602, "paths must be a non-empty array");
		const files = [];
		for (const p of paths) {
			const full = path.resolve(String(p));
			const stat = await fs.promises.stat(full).catch(() => null);
			if (!stat?.isFile()) throw rpcError(-32602, `Not a file: ${full}`);
			if (stat.size > MEDIA_LIMIT) throw rpcError(-32602, `Too large: ${full}`);
			const data = await fs.promises.readFile(full);
			files.push({ name: path.basename(full), type: MIME[path.extname(full).slice(1).toLowerCase()] ?? "", lastModified: stat.mtimeMs, data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) });
		}
		return callPage("media.import", { files });
	},
	"export.run": async ({ path: out, ...options } = {}) => {
		if (!out) throw rpcError(-32602, "path is required");
		const target = path.resolve(String(out));
		await fs.promises.mkdir(path.dirname(target), { recursive: true });
		const format = options.format ?? (path.extname(target).slice(1).toLowerCase() || "mp4");
		const result = await callPage("export.run", { ...options, format });
		await fs.promises.writeFile(target, Buffer.from(result.buffer));
		return { path: target, bytes: result.buffer.byteLength, format };
	},
	"methods.list": () => [...Object.keys(MAIN_METHODS), ...PAGE_METHODS].sort(),
};

const PAGE_METHODS = [
	"project.list",
	"project.current",
	"project.create",
	"project.open",
	"project.rename",
	"media.list",
	"timeline.list",
	"timeline.addMedia",
	"timeline.addText",
	"playback.seek",
	"cloud.sync",
];

async function dispatch(method, params) {
	if (MAIN_METHODS[method]) return MAIN_METHODS[method](params ?? {});
	if (PAGE_METHODS.includes(method)) return callPage(method, params ?? {});
	throw rpcError(-32601, `Unknown method: ${method}`);
}

function serve(socket) {
	let authed = false;
	let buffer = "";
	const send = (msg) => socket.write(`${JSON.stringify({ jsonrpc: "2.0", ...msg })}\n`);
	socket.setEncoding("utf8");
	socket.on("error", () => {});
	socket.on("data", (chunk) => {
		buffer += chunk;
		if (buffer.length > MAX_LINE) return socket.destroy();
		let nl;
		while ((nl = buffer.indexOf("\n")) >= 0) {
			const line = buffer.slice(0, nl).trim();
			buffer = buffer.slice(nl + 1);
			if (!line) continue;
			let req;
			try {
				req = JSON.parse(line);
			} catch {
				send({ id: null, error: { code: -32700, message: "Parse error" } });
				continue;
			}
			const { id = null, method, params } = req;
			if (!authed) {
				const given = Buffer.from(String(params?.token ?? ""));
				const want = Buffer.from(token);
				if (method === "auth" && given.length === want.length && crypto.timingSafeEqual(given, want)) {
					authed = true;
					send({ id, result: { ok: true, api: VERSION } });
				} else {
					send({ id, error: { code: -32003, message: "Send auth with the token from automation.json first" } });
					socket.end();
				}
				continue;
			}
			// Binary results (export) never cross the socket; strip ArrayBuffers.
			Promise.resolve()
				.then(() => dispatch(String(method), params))
				.then((result) => send({ id, result: result ?? null }))
				.catch((error) => send({ id, error: { code: error.rpcCode ?? -32000, message: error.message } }));
		}
	});
}

async function start() {
	if (server) return;
	token = crypto.randomBytes(32).toString("hex");
	const address = socketPath();
	if (process.platform !== "win32") await fs.promises.rm(address, { force: true });
	server = net.createServer(serve);
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(address, resolve);
	});
	if (process.platform !== "win32") await fs.promises.chmod(address, 0o600);
	await fs.promises.writeFile(
		discoveryFile(),
		JSON.stringify({ socket: address, token, pid: process.pid, api: VERSION }, null, 2),
		{ mode: 0o600 },
	);
	await fs.promises.chmod(discoveryFile(), 0o600).catch(() => {});
}

async function stop() {
	if (!server) return;
	await new Promise((resolve) => server.close(resolve));
	server = null;
	token = null;
	await fs.promises.rm(discoveryFile(), { force: true });
	if (process.platform !== "win32") await fs.promises.rm(socketPath(), { force: true });
}

function getState() {
	return { enabled: readSettings().enabled, running: !!server, socket: server ? socketPath() : null, discovery: discoveryFile() };
}

module.exports = {
	async init() {
		if (readSettings().enabled || process.argv.includes("--automation")) await start().catch((error) => console.error("Automation API didn't start:", error.message));
	},
	getState,
	async setEnabled(enabled) {
		await fs.promises.writeFile(settingsFile(), JSON.stringify({ enabled: !!enabled }));
		if (enabled) await start();
		else await stop();
		const state = getState();
		for (const fn of listeners) fn(state);
		return state;
	},
	stop,
	_test: { dispatch, MAIN_METHODS, PAGE_METHODS },
};
