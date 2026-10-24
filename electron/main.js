// Worksuite FrameFlow desktop shell: runs the bundled Next.js server on a
// private loopback port and shows it in a window.
const { app, BrowserWindow, clipboard, shell, dialog, ipcMain, Menu, nativeTheme } = require("electron");
const { spawn } = require("node:child_process");
const capture = require("./capture");
const cursorLog = require("./cursor-log");
const recordingOverlay = require("./recording-overlay");
const recordingFrame = require("./recording-frame");
const recordingTray = require("./recording-tray");
const captureControls = require("./capture-controls");
const privacy = require("./privacy");
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
const assetStore = require("./asset-store");
const projectFolders = require("./project-folders");
const ai = require("./ai");
const automation = require("./automation");
const projectWindows = require("./project-windows");
const nativeHelper = require("./native-helper");
const converter = require("./converter");
const downloader = require("./downloader");
const masterExport = require("./master-export");

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

// The native title bar (macOS, Windows) follows nativeTheme: keep it on the
// app's own Light/Dark choice, remembered so the next launch starts right.
const themeFile = () => path.join(app.getPath("userData"), "theme.json");
function applyTheme(theme) {
	const source = theme === "light" || theme === "dark" ? theme : "system";
	nativeTheme.themeSource = source;
	return source;
}
function loadTheme() {
	try {
		return applyTheme(JSON.parse(fs.readFileSync(themeFile(), "utf8")).theme);
	} catch {
		return applyTheme("dark"); // the app's default theme
	}
}
const windowBackground = () => (nativeTheme.shouldUseDarkColors ? "#0F172A" : "#FFFFFF");

const WINDOW_OPTIONS = {
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
};

/** Keep a window on the app's origin; panels may pop out (WS-03). */
function guardWindow(win, origin) {
	win.webContents.setWindowOpenHandler(({ url, frameName }) => {
		// Editor panels moved to their own window for a second monitor
		// (WS-03): same-origin blank windows the editor renders into.
		if (url === "about:blank" && /^frameflow-[a-z]+$/.test(frameName)) {
			return {
				action: "allow",
				overrideBrowserWindowOptions: {
					title: "Worksuite FrameFlow",
					backgroundColor: "#0F172A",
					autoHideMenuBar: true,
					icon: path.join(__dirname, "build", "icon.png"),
					webPreferences: { contextIsolation: true, sandbox: true },
				},
			};
		}
		// Motion Studio opened from the editor: another app window.
		if (url.startsWith(`${origin}/motion`)) {
			return {
				action: "allow",
				overrideBrowserWindowOptions: {
					width: 1440,
					height: 900,
					title: "Motion Studio — Worksuite FrameFlow",
					backgroundColor: windowBackground(),
					autoHideMenuBar: true,
					icon: path.join(__dirname, "build", "icon.png"),
					webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, "preload.js") },
				},
			};
		}
		shell.openExternal(url);
		return { action: "deny" };
	});
	win.webContents.on("will-navigate", (event, url) => {
		if (!url.startsWith(origin)) {
			event.preventDefault();
			shell.openExternal(url);
		}
	});
}

// The standalone recorder (Camtasia-style): a small window that stays on
// top and is left out of screen captures, so it never shows in a recording.
let recorderWindow = null;
let mainWindow = null;
function openRecorder() {
	if (recorderWindow && !recorderWindow.isDestroyed()) {
		recorderWindow.show();
		recorderWindow.focus();
		return;
	}
	recorderWindow = new BrowserWindow({
		...WINDOW_OPTIONS,
		width: 900,
		height: 260,
		minWidth: 760,
		minHeight: 220,
		resizable: true,
		maximizable: false,
		fullscreenable: false,
		alwaysOnTop: true,
		title: "FrameFlow Recorder",
		backgroundColor: windowBackground(),
	});
	recorderWindow.setContentProtection(true);
	guardWindow(recorderWindow, appOrigin);
	// Global shortcuts drive the recorder window while it's open (CT-R3).
	captureControls.setTarget(recorderWindow);
	recorderWindow.on("closed", () => {
		recorderWindow = null;
		if (mainWindow && !mainWindow.isDestroyed()) captureControls.setTarget(mainWindow);
	});
	void recorderWindow.loadURL(`${appOrigin}/recorder`);
}

function focusMain() {
	const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : BrowserWindow.getAllWindows().find((w) => w !== recorderWindow);
	if (!win) return;
	if (win.isMinimized()) win.restore();
	win.show();
	win.focus();
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
		backgroundColor: windowBackground(),
		icon: path.join(__dirname, "build", "icon.png"),
		autoHideMenuBar: true,
		webPreferences: {
			contextIsolation: true,
			sandbox: true,
			preload: path.join(__dirname, "preload.js"),
		},
	});

	mainWindow = win;
	capture.setupCapture({ session: win.webContents.session, origin });
	captureControls.init({ window: win });
	network.guardSession({
		session: win.webContents.session,
		origin,
		allow: [updates.FEED_BASE],
	});
	assetStore.handleProtocol({ session: win.webContents.session, origin });

	// Keep the app on its own origin; open everything else in the system browser.
	guardWindow(win, origin);
	projectWindows.init({
		window: win,
		appOrigin: origin,
		create: () => {
			const extra = new BrowserWindow(WINDOW_OPTIONS);
			guardWindow(extra, origin);
			return extra;
		},
	});

	await win.loadURL(`${origin}/projects`);
}

// Files the app has exported (kept across restarts so Exports can reveal them).
const savedExports = new Set();
const exportsFile = () => path.join(app.getPath("userData"), "exports.json");
function loadSavedExports() {
	try {
		for (const p of JSON.parse(fs.readFileSync(exportsFile(), "utf8"))) if (typeof p === "string") savedExports.add(p);
	} catch {
		// First run.
	}
}
function rememberExport(filePath) {
	savedExports.add(filePath);
	try {
		fs.writeFileSync(exportsFile(), JSON.stringify([...savedExports].slice(-500)));
	} catch {
		// Not fatal: revealing just won't survive a restart.
	}
}

function registerAccountIpc() {
	// Only the editor's own origin may drive the account.
	const fromApp = (event) => event.senderFrame?.url.startsWith(appOrigin);
	const handle = (channel, fn) =>
		ipcMain.handle(channel, (event, ...args) => {
			if (!fromApp(event)) throw new Error("Not allowed");
			return fn(...args);
		});

	// Same check, for handlers that need to know which window asked.
	const handleFrom = (channel, fn) =>
		ipcMain.handle(channel, (event, ...args) => {
			if (!fromApp(event)) throw new Error("Not allowed");
			return fn(event, ...args);
		});
	handleFrom("windows:report", (event, args) => projectWindows.report(event, args));
	handleFrom("windows:open", (event, args) => projectWindows.open(event, args));
	handleFrom("windows:move-to-main", (event, args) => projectWindows.moveToMain(event, args));
	handleFrom("windows:take", (event, args) => projectWindows.take(event, args));
	handleFrom("windows:is-main", (event) => projectWindows.isMain(event));

	handle("app:version", () => app.getVersion());
	handle("app:set-theme", (theme) => {
		const source = applyTheme(theme);
		fs.promises.writeFile(themeFile(), JSON.stringify({ theme: source })).catch(() => {});
		for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.setBackgroundColor(windowBackground());
		return source;
	});
	handle("recorder:open", () => openRecorder());
	// Converter (SRS 37.3). Results go next to the original unless a folder is chosen.
	const convertFolder = (saveTo) =>
		saveTo === "converted" ? path.join(app.getPath("videos"), "Worksuite", "Converted") : typeof saveTo === "string" && path.isAbsolute(saveTo) ? saveTo : undefined;
	const withProgress = (event, jobId) => (progress) => event.sender.send("tools:convert-progress", { jobId, progress });
	const remember = (result) => {
		rememberExport(result.path);
		return result;
	};
	handle("tools:caps", () => converter.capabilities());
	handle("tools:probe", (input) => converter.probe(String(input)));
	handleFrom("tools:convert", async (event, args = {}) =>
		remember(
			await converter.convert({
				jobId: args.jobId,
				input: args.input,
				options: args.options ?? args,
				folder: convertFolder(args.saveTo),
				onProgress: withProgress(event, args.jobId),
			}),
		),
	);
	handleFrom("tools:trim", async (event, args = {}) =>
		remember(await converter.trim({ ...args, folder: convertFolder(args.saveTo), onProgress: withProgress(event, args.jobId) })),
	);
	handleFrom("tools:merge", async (event, args = {}) =>
		remember(await converter.merge({ ...args, folder: convertFolder(args.saveTo), onProgress: withProgress(event, args.jobId) })),
	);
	handleFrom("tools:repair", async (event, args = {}) =>
		remember(await converter.repair({ ...args, folder: convertFolder(args.saveTo), onProgress: withProgress(event, args.jobId) })),
	);
	handleFrom("tools:choose-folder", async (event) => {
		const win = BrowserWindow.fromWebContents(event.sender);
		const result = await dialog.showOpenDialog(win, { properties: ["openDirectory", "createDirectory"] });
		return result.canceled ? null : result.filePaths[0] ?? null;
	});
	handle("tools:cancel-convert", (jobId) => converter.cancel(jobId));
	const downloadFolder = () => path.join(app.getPath("downloads"), "Worksuite");
	handle("tools:inspect-link", (args = {}) => downloader.inspect({ url: args.url }));
	handleFrom("tools:download", async (event, args = {}) => {
		const onProgress = (p) => event.sender.send("tools:download-progress", { jobId: args.jobId, ...p });
		const common = { jobId: args.jobId, url: args.url, folder: downloadFolder(), onProgress };
		const saved =
			args.kind === "hls" || args.kind === "dash"
				? await downloader.downloadStream({ ...common, title: args.title, start: args.start, end: args.end, audioOnly: args.audioOnly, duration: args.duration, runFfmpeg: converter.runFfmpeg })
				: await downloader.downloadFile({ ...common, name: args.name, speedLimit: Number(args.speedLimit) || 0 });
		rememberExport(saved.path);
		return saved;
	});
	// Streams can't resume mid-way: pausing stops FFmpeg and resume starts over.
	handle("tools:save-subtitles", (args = {}) => {
		if (!savedExports.has(args.videoPath)) throw new Error("Not allowed");
		return downloader.saveSubtitles({ subtitles: args.subtitles, videoPath: args.videoPath, runFfmpeg: converter.runFfmpeg });
	});
	handle("network:connection", () => network.connectionKind());
	handle("tools:pause-download", (jobId) => downloader.pause(jobId) || (converter.cancel(jobId), false));
	handle("tools:cancel-download", (jobId) => {
		downloader.cancel(jobId);
		converter.cancel(jobId);
		return downloader.discard({ jobId, folder: downloadFolder() });
	});
	// Reads back a file this app saved (converted or downloaded), to open it in the editor.
	handle("tools:read-saved", async (filePath) => {
		if (!savedExports.has(filePath)) throw new Error("Not allowed");
		const data = await fs.promises.readFile(filePath);
		return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
	});
	handle("recorder:focus-main", () => focusMain());
	// Recordings library and settings (CT-R1, CT-R2).
	const recordingsFolder = (folder) => (typeof folder === "string" && path.isAbsolute(folder) ? folder : path.join(app.getPath("videos"), "Worksuite", "Recordings"));
	handle("recorder:save-take", async ({ fileName, data, folder } = {}) => {
		const dir = recordingsFolder(folder);
		await fs.promises.mkdir(dir, { recursive: true });
		const clean = path.basename(String(fileName)).replace(/[<>:"|?*\x00-\x1f]/g, "_") || "Recording.webm";
		const ext = path.extname(clean);
		const stem = clean.slice(0, clean.length - ext.length);
		let target = path.join(dir, clean);
		for (let n = 2; fs.existsSync(target); n++) target = path.join(dir, `${stem} (${n})${ext}`);
		await writeAtomically(target, Buffer.from(data));
		rememberExport(target);
		return { path: target };
	});
	handle("recorder:folder-info", async (folder) => {
		const dir = recordingsFolder(folder);
		await fs.promises.mkdir(dir, { recursive: true }).catch(() => {});
		const stats = await fs.promises.statfs(dir).catch(() => null);
		return { folder: dir, freeBytes: stats ? stats.bavail * stats.bsize : null };
	});
	handle("recorder:delete-take", async (filePath) => {
		if (typeof filePath !== "string" || !savedExports.has(filePath)) return false;
		await fs.promises.rm(filePath, { force: true });
		return true;
	});
	handle("recorder:exists", (filePath) => typeof filePath === "string" && savedExports.has(filePath) && fs.existsSync(filePath));
	handleFrom("recorder:set-size", (event, { width, height } = {}) => {
		const win = BrowserWindow.fromWebContents(event.sender);
		if (!win || win !== recorderWindow) return;
		const w = Math.max(760, Math.min(1400, Number(width) || 900));
		const h = Math.max(220, Math.min(1000, Number(height) || 260));
		win.setSize(w, h, true);
	});
	handleFrom("recorder:minimize", (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
	handle("capture:sources", () => capture.listSources());
	handle("capture:choose", (id) => capture.chooseSource(id));
	handle("capture:permissions", () => capture.permissionStatus());
	// Click ripples, keys pressed and private-window covers in the recording (CT-R4).
	handle("capture:overlay-start", (args) => recordingOverlay.start(args ?? {}));
	handle("capture:overlay-pause", (on) => recordingOverlay.setPaused(on));
	handle("capture:overlay-stop", () => recordingOverlay.stop());
	handle("capture:request-permission", (kind) => capture.requestPermission(String(kind)));
	handle("capture:open-permission-settings", (kind) => capture.openPermissionSettings(String(kind)));
	handle("capture:frame-show", (args) => recordingFrame.show(args ?? {}));
	handle("capture:frame-count", (n) => recordingFrame.count(n));
	handle("capture:frame-paused", (on) => recordingFrame.paused(on));
	handle("capture:frame-hide", () => recordingFrame.hide());
	handle("capture:indicator", (state) => {
		if (state === "recording" || state === "paused") {
			if (!recordingTray.active()) recordingTray.show();
			recordingTray.paused(state === "paused");
		} else recordingTray.hide();
	});
	handle("capture:cursor-start", (args) => cursorLog.start(args ?? {}));
	handle("capture:cursor-pause", () => cursorLog.pause());
	handle("capture:cursor-resume", () => cursorLog.resume());
	handle("capture:cursor-stop", () => cursorLog.stop());
	handle("capture:cursor-available", () => cursorLog.available());
	handle("capture:bar-show", () => captureControls.showBar({ owner: BrowserWindow.getFocusedWindow() }));
	handle("capture:bar-state", (state) => captureControls.updateBar(state));
	handle("capture:bar-hide", () => captureControls.hideBar());
	handle("capture:shortcuts", (next) => captureControls.setShortcuts(next ?? {}));
	handle("capture:window-names", () => privacy.windowNames());
	handle("capture:do-not-disturb", (on) => privacy.doNotDisturb(on === true));
	handle("account:get-state", () => account.getState());
	handle("account:sign-in", async ({ signup } = {}) => {
		if (network.isOffline()) {
			return { ok: false, error: "Offline mode is on. Turn it off to sign in." };
		}
		const result = await account.signIn({ signup });
		// Sign-up still works on the web when the sign-in service is down.
		if (!result.ok && signup && /reach|unreachable/i.test(result.error ?? "")) {
			shell.openExternal("https://worksuitecloud.com/signup");
			return { ok: false, error: "Opened Worksuite sign-up in your browser. Sign in here once your account is ready." };
		}
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
	/**
	 * Writes next to the destination first, checks the size, then renames,
	 * so an interrupted export never leaves a half-written file (SRS EX-13).
	 */
	const writeAtomically = async (filePath, bytes) => {
		const temp = `${filePath}.${process.pid}.part`;
		try {
			await fs.promises.writeFile(temp, bytes);
			const { size } = await fs.promises.stat(temp);
			if (size !== bytes.length) throw new Error("The export file didn't write completely.");
			await fs.promises.rename(temp, filePath);
		} catch (error) {
			await fs.promises.unlink(temp).catch(() => {});
			throw error;
		}
	};
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
		await writeAtomically(result.filePath, Buffer.from(data));
		const base = result.filePath.slice(0, -path.extname(result.filePath).length);
		for (const side of sideFiles) {
			const suffix = String(side.suffix).replace(/[\\/]/g, "");
			await fs.promises.writeFile(`${base}${suffix}`, String(side.content), "utf8");
		}
		rememberExport(result.filePath);
		return { saved: true, path: result.filePath };
	});
	// Queued exports (EX-14) go straight into Videos/Worksuite, no dialog.
	handle("files:save-to-folder", async ({ fileName, data }) => {
		const folder = path.join(app.getPath("videos"), "Worksuite");
		await fs.promises.mkdir(folder, { recursive: true });
		const clean = path.basename(String(fileName)).replace(/[<>:"|?*\x00-\x1f]/g, "_") || "export.mp4";
		const ext = path.extname(clean);
		const stem = clean.slice(0, clean.length - ext.length);
		let target = path.join(folder, clean);
		for (let n = 2; fs.existsSync(target); n++) target = path.join(folder, `${stem} (${n})${ext}`);
		await writeAtomically(target, Buffer.from(data));
		rememberExport(target);
		return { saved: true, path: target };
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
	assetStore.registerIpc(handle);
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
	handle("helper:caps", () => nativeHelper.getCaps());
	handle("master:codecs", () => (nativeHelper._test.ffmpegPath() ? masterExport.codecs() : []));
	handle("master:start", (args) => masterExport.start(args ?? {}));
	handle("master:frame", (args) => masterExport.frame(args ?? {}));
	handle("master:finish", (args) => masterExport.finish(args ?? {}));
	handle("master:cancel", (args) => masterExport.cancel(args ?? {}));
	handle("master:save", (args) => masterExport.save(args ?? {}));
	handle("master:encode-audio", (args) => masterExport.encodeAudio(args ?? {}));
	handle("master:mux-audio", (args) => masterExport.muxAudio(args ?? {}));
	handle("master:convert-image", (args) => masterExport.convertImage(args ?? {}));
	handle("master:encode-still", (args) => masterExport.encodeStill(args ?? {}));
	handle("helper:configure", (args) => nativeHelper.configure(args ?? {}));
	handle("helper:begin", () => nativeHelper.begin());
	handle("helper:write", (args) => nativeHelper.write(args ?? {}));
	handle("helper:proxy", (args) => nativeHelper.proxy(args ?? {}));
	handle("helper:sphere", (args) => nativeHelper.sphere(args ?? {}));
	handle("helper:read", (args) => nativeHelper.read(args ?? {}));
	handle("helper:release", (args) => nativeHelper.release(args ?? {}));
	handle("automation:get-state", () => automation.getState());
	handle("automation:set-enabled", (enabled) => automation.setEnabled(!!enabled));
	handle("ai:get-state", () => ai.getState());
	handle("ai:set-key", (args) => ai.setKey(args ?? {}));
	handle("ai:clear-key", (args) => ai.clearKey(args ?? {}));
	handle("ai:test", (args) => ai.test(args));
	handle("ai:generate", (args) => ai.generate(args));
	handle("ai:cancel", () => ai.cancel());
	handle("folders:get", (args) => projectFolders.get(args ?? {}));
	handle("folders:create", (args) => projectFolders.create(args ?? {}));
	handle("folders:open", () => projectFolders.open());
	handle("folders:attach", (args) => projectFolders.attach(args ?? {}));
	handle("folders:unlink", (args) => projectFolders.unlink(args ?? {}));
	handle("folders:write-json", (args) => projectFolders.writeJson(args ?? {}));
	handle("folders:list-media", (args) => projectFolders.listMedia(args ?? {}));
	handle("folders:write-media", (args) => projectFolders.writeMedia(args ?? {}));
	handle("folders:read-media", (args) => projectFolders.readMedia(args ?? {}));
	handle("folders:remove-media", (args) => projectFolders.removeMedia(args ?? {}));
	handle("folders:show", (args) => projectFolders.show(args ?? {}));
	handle("folders:move", (args) => projectFolders.move(args ?? {}));
	// Only files the app exported can be revealed. False when it's gone.
	handle("files:show", (filePath) => {
		if (!savedExports.has(filePath) || !fs.existsSync(filePath)) return false;
		shell.showItemInFolder(filePath);
		return true;
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

// Installed asset packs are served to the page as wsc-asset://<pack>/<version>/<file>.
assetStore.registerScheme();

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
			loadTheme();
			loadSavedExports();
			registerAccountIpc();
			void automation.init();
			void nativeHelper.init();
			// A menu without Close Window / Ctrl+Tab accelerators, so the editor's
			// project tab shortcuts (Ctrl/Cmd+W, Ctrl+Tab, Ctrl+Shift+T) reach it.
			Menu.setApplicationMenu(
				Menu.buildFromTemplate([
					...(process.platform === "darwin"
						? [{ role: "appMenu" }]
						: []),
					{ role: "editMenu" },
					{
						label: "View",
						submenu: [
							{ role: "reload" },
							{ role: "toggleDevTools" },
							{ type: "separator" },
							{ role: "resetZoom" },
							{ role: "zoomIn" },
							{ role: "zoomOut" },
							{ type: "separator" },
							{ role: "togglefullscreen" },
						],
					},
					{ label: "Window", submenu: [{ role: "minimize" }] },
				]),
			);
			account.init();
			updates.init();
			assetStore.init({ isOffline: () => network.getState().offline, onNetworkChange: network.onChange, getAccessToken: account.getAccessToken, account });
			return createWindow();
		})
		.catch((err) => {
			dialog.showErrorBox("Worksuite FrameFlow", String(err));
			app.quit();
		});
}

app.on("before-quit", () => {
	void privacy.doNotDisturb(false);
	captureControls.dispose();
	recordingOverlay.stop();
	void automation.stop();
	app.isQuitting = true;
	if (server) server.kill();
});
app.on("window-all-closed", () => app.quit());
