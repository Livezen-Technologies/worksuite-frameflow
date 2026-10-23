// Worksuite FrameFlow desktop shell: runs the bundled Next.js server on a
// private loopback port and shows it in a window.
const { app, BrowserWindow, clipboard, shell, dialog, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const capture = require("./capture");
const network = require("./network");
const uploadQueue = require("./upload-queue");
const net = require("node:net");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const account = require("./account");
const cloud = require("./cloud-upload");
const cloudSync = require("./cloud-sync");
const updates = require("./updater");

const HOST = "127.0.0.1";
let server = null;
let appOrigin = null;

// The page's storage (projects, media, settings) belongs to its origin, so
// the server must come back on the same port every launch. The port is
// remembered per install; another is picked only if it's taken.
const DEFAULT_PORT = 38719;
const portFile = () => path.join(app.getPath("userData"), "server-port.json");

function tryPort(port) {
	return new Promise((resolve) => {
		const s = net.createServer();
		s.unref();
		s.on("error", () => resolve(null));
		s.listen(port, HOST, () => {
			const { port: bound } = s.address();
			s.close(() => resolve(bound));
		});
	});
}

async function stablePort() {
	let saved = null;
	try {
		saved = Number(JSON.parse(fs.readFileSync(portFile(), "utf8")).port) || null;
	} catch {}
	const preferred = saved ?? DEFAULT_PORT;
	for (let offset = 0; offset < 20; offset++) {
		const port = await tryPort(preferred + offset);
		if (port) {
			if (port !== saved) {
				if (saved) console.warn(`Port ${saved} is busy; using ${port}. Local projects stay on the old port.`);
				fs.writeFileSync(portFile(), JSON.stringify({ port }));
			}
			return port;
		}
	}
	return tryPort(0);
}

function waitForServer(url, timeoutMs = 30000) {
	const deadline = Date.now() + timeoutMs;
	return new Promise((resolve, reject) => {
		const attempt = () => {
			http
				.get(url, (res) => {
					res.resume();
					resolve();
				})
				.on("error", () => {
					if (Date.now() > deadline) reject(new Error("Editor server did not start"));
					else setTimeout(attempt, 200);
				});
		};
		attempt();
	});
}

async function startServer() {
	const port = await stablePort();
	const webRoot = app.isPackaged
		? path.join(process.resourcesPath, "web")
		: path.join(__dirname, "web");
	const serverJs = path.join(webRoot, "apps", "web", "server.js");
	const origin = `http://${HOST}:${port}`;

	server = spawn(process.execPath, [serverJs], {
		cwd: path.dirname(serverJs),
		stdio: "inherit",
		env: {
			...process.env,
			ELECTRON_RUN_AS_NODE: "1",
			NODE_ENV: "production",
			PORT: String(port),
			HOSTNAME: HOST,
			NEXT_PUBLIC_SITE_URL: origin,
			// The web app validates these at startup. Cloud-only features
			// (accounts, feedback, sound search) stay offline in the desktop app;
			// editing and export run entirely on-device.
			DATABASE_URL: process.env.DATABASE_URL || "postgresql://offline:offline@127.0.0.1:1/offline",
			BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || "worksuite-desktop-offline-only-secret-not-used-for-cloud",
			UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || "https://offline.invalid",
			UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || "offline",
			NEXT_PUBLIC_MARBLE_API_URL: process.env.NEXT_PUBLIC_MARBLE_API_URL || "https://offline.invalid",
			MARBLE_WORKSPACE_KEY: process.env.MARBLE_WORKSPACE_KEY || "offline",
			FREESOUND_CLIENT_ID: process.env.FREESOUND_CLIENT_ID || "offline",
			FREESOUND_API_KEY: process.env.FREESOUND_API_KEY || "offline",
		},
	});
	server.on("exit", (code) => {
		if (code && !app.isQuitting) {
			dialog.showErrorBox("Worksuite FrameFlow", `The editor server stopped (code ${code}).`);
			app.quit();
		}
	});

	await waitForServer(`${origin}/api/health`);
	return origin;
}

async function createWindow() {
	const origin = await startServer();
	appOrigin = origin;
	const win = new BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 1024,
		minHeight: 640,
		title: "Worksuite FrameFlow",
		backgroundColor: "#0F172A",
		icon: path.join(__dirname, "build", "icon.png"),
		autoHideMenuBar: true,
		webPreferences: {
			contextIsolation: true,
			sandbox: true,
			preload: path.join(__dirname, "preload.js"),
		},
	});

	capture.setupCapture({ session: win.webContents.session, origin });
	network.guardSession({
		session: win.webContents.session,
		origin,
		allow: [updates.FEED_BASE],
	});

	// Keep the app on its own origin; open everything else in the system browser.
	win.webContents.setWindowOpenHandler(({ url }) => {
		shell.openExternal(url);
		return { action: "deny" };
	});
	win.webContents.on("will-navigate", (event, url) => {
		if (!url.startsWith(origin)) {
			event.preventDefault();
			shell.openExternal(url);
		}
	});

	await win.loadURL(`${origin}/projects`);
}

const savedExports = new Set();

function registerAccountIpc() {
	// Only the editor's own origin may drive the account.
	const fromApp = (event) => event.senderFrame?.url.startsWith(appOrigin);
	const handle = (channel, fn) =>
		ipcMain.handle(channel, (event, ...args) => {
			if (!fromApp(event)) throw new Error("Not allowed");
			return fn(...args);
		});

	handle("app:version", () => app.getVersion());
	handle("capture:sources", () => capture.listSources());
	handle("capture:choose", (id) => capture.chooseSource(id));
	handle("capture:permissions", () => capture.permissionStatus());
	handle("account:get-state", () => account.getState());
	handle("account:sign-in", async ({ signup } = {}) => {
		if (network.isOffline()) {
			return { ok: false, error: "Offline mode is on. Turn it off to sign in." };
		}
		const result = await account.signIn({ signup });
		if (result.ok) {
			const [win] = BrowserWindow.getAllWindows();
			if (win) {
				if (win.isMinimized()) win.restore();
				win.focus();
			}
		}
		return result;
	});
	handle("account:cancel", () => account.cancelSignIn());
	handle("account:reopen", () => account.reopenSignIn());
	handle("account:switch-workspace", (id) => account.switchWorkspace(String(id)));
	handle("account:sign-out", () => account.signOut());
	handle("account:manage", () => account.openManageAccount());

	// Exports: a native Save dialog, defaulting to Videos/Worksuite. Side files
	// (e.g. captions .srt) are written next to the video with the same name.
	handle("files:save-export", async ({ suggestedName, data, sideFiles = [] }) => {
		const folder = path.join(app.getPath("videos"), "Worksuite");
		await fs.promises.mkdir(folder, { recursive: true }).catch(() => {});
		const [win] = BrowserWindow.getAllWindows();
		const ext = path.extname(String(suggestedName)).slice(1) || "mp4";
		const result = await dialog.showSaveDialog(win, {
			defaultPath: path.join(folder, path.basename(String(suggestedName))),
			filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
		});
		if (result.canceled || !result.filePath) return { saved: false };
		await fs.promises.writeFile(result.filePath, Buffer.from(data));
		const base = result.filePath.slice(0, -path.extname(result.filePath).length);
		for (const side of sideFiles) {
			const suffix = String(side.suffix).replace(/[\\/]/g, "");
			await fs.promises.writeFile(`${base}${suffix}`, String(side.content), "utf8");
		}
		savedExports.add(result.filePath);
		return { saved: true, path: result.filePath };
	});
	// Share links (CL-06): only files this session exported can be uploaded.
	handle("cloud:upload-share", async ({ filePath, expiresInDays, allowDownload } = {}) => {
		if (!savedExports.has(filePath)) return { ok: false, code: "denied", message: "Not allowed" };
		try {
			const share = await cloud.uploadAndShare({
				filePath,
				expiresInDays: Number(expiresInDays) || null,
				allowDownload: !!allowDownload,
				onProgress: (progress) => {
					for (const win of BrowserWindow.getAllWindows()) {
						win.webContents.send("cloud:progress", progress);
					}
				},
			});
			return { ok: true, ...share };
		} catch (error) {
			return { ok: false, code: error.code ?? "error", message: error.message };
		}
	});
	handle("cloud:cancel", () => cloud.cancelUpload());
	handle("updates:get-state", () => updates.getState());
	handle("updates:check", () => updates.check());
	handle("updates:download", () => updates.download());
	handle("updates:install", () => updates.install());
	handle("updates:configure", (settings) => updates.configure(settings ?? {}));
	handle("cloud:sync", (operation, args) => cloudSync.run(String(operation), args));
	handle("network:get-state", () => network.getState());
	handle("network:update", (patch = {}) =>
		network.update({
			...("offline" in patch ? { offline: !!patch.offline } : {}),
			...("bandwidthLimit" in patch
				? { bandwidthLimit: Math.max(0, Number(patch.bandwidthLimit) || 0) }
				: {}),
		}),
	);
	handle("uploads:list", () => uploadQueue.list());
	handle("uploads:pause", (id) => uploadQueue.pause(id));
	handle("uploads:resume", (id) => uploadQueue.resume(id));
	handle("uploads:pause-all", () => uploadQueue.pauseAll());
	handle("uploads:resume-all", () => uploadQueue.resumeAll());
	handle("clipboard:write", (text) => clipboard.writeText(String(text)));
	// Only files this session exported can be revealed.
	handle("files:show", (filePath) => {
		if (savedExports.has(filePath)) shell.showItemInFolder(filePath);
	});

	const broadcast = (channel, payload) => {
		for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload);
	};
	network.onChange((state) => broadcast("network:changed", state));
	uploadQueue.onChange((list) => broadcast("uploads:changed", list));

	account.onChange((state) => {
		for (const win of BrowserWindow.getAllWindows()) {
			win.webContents.send("account:changed", state);
		}
	});
}

if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {
	app.on("second-instance", () => {
		const [win] = BrowserWindow.getAllWindows();
		if (win) {
			if (win.isMinimized()) win.restore();
			win.focus();
		}
	});
	app
		.whenReady()
		.then(() => {
			registerAccountIpc();
			account.init();
			updates.init();
			return createWindow();
		})
		.catch((err) => {
			dialog.showErrorBox("Worksuite FrameFlow", String(err));
			app.quit();
		});
}

app.on("before-quit", () => {
	app.isQuitting = true;
	if (server) server.kill();
});
app.on("window-all-closed", () => app.quit());
