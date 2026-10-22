// Worksuite FrameFlow desktop shell: runs the bundled Next.js server on a
// private loopback port and shows it in a window.
const { app, BrowserWindow, shell, dialog, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const net = require("node:net");
const http = require("node:http");
const path = require("node:path");
const account = require("./account");

const HOST = "127.0.0.1";
let server = null;
let appOrigin = null;

function freePort() {
	return new Promise((resolve, reject) => {
		const s = net.createServer();
		s.unref();
		s.on("error", reject);
		s.listen(0, HOST, () => {
			const { port } = s.address();
			s.close(() => resolve(port));
		});
	});
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
	const port = await freePort();
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

function registerAccountIpc() {
	// Only the editor's own origin may drive the account.
	const fromApp = (event) => event.senderFrame?.url.startsWith(appOrigin);
	const handle = (channel, fn) =>
		ipcMain.handle(channel, (event, ...args) => {
			if (!fromApp(event)) throw new Error("Not allowed");
			return fn(...args);
		});

	handle("app:version", () => app.getVersion());
	handle("account:get-state", () => account.getState());
	handle("account:sign-in", async ({ signup } = {}) => {
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
