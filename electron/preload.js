// Exposes the Worksuite account to the editor UI. Tokens never cross this
// bridge: the page only sees sign-in state and the cached profile.
const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("worksuite", {
	app: {
		getVersion: () => ipcRenderer.invoke("app:version"),
		setTheme: (theme) => ipcRenderer.invoke("app:set-theme", theme),
	},
	capture: {
		sources: () => ipcRenderer.invoke("capture:sources"),
		choose: (id) => ipcRenderer.invoke("capture:choose", id),
		permissions: () => ipcRenderer.invoke("capture:permissions"),
		cursorStart: (args) => ipcRenderer.invoke("capture:cursor-start", args),
		cursorPause: () => ipcRenderer.invoke("capture:cursor-pause"),
		cursorResume: () => ipcRenderer.invoke("capture:cursor-resume"),
		cursorStop: () => ipcRenderer.invoke("capture:cursor-stop"),
		showBar: () => ipcRenderer.invoke("capture:bar-show"),
		barState: (state) => ipcRenderer.invoke("capture:bar-state", state),
		hideBar: () => ipcRenderer.invoke("capture:bar-hide"),
		setShortcuts: (next) => ipcRenderer.invoke("capture:shortcuts", next),
		windowNames: () => ipcRenderer.invoke("capture:window-names"),
		doNotDisturb: (on) => ipcRenderer.invoke("capture:do-not-disturb", on),
		onCommand: (listener) => {
			const handler = (_event, command) => listener(command);
			ipcRenderer.on("capture:command", handler);
			return () => ipcRenderer.removeListener("capture:command", handler);
		},
	},
	network: {
		getState: () => ipcRenderer.invoke("network:get-state"),
		update: (patch) => ipcRenderer.invoke("network:update", patch),
		onChange: (listener) => {
			const handler = (_event, state) => listener(state);
			ipcRenderer.on("network:changed", handler);
			return () => ipcRenderer.removeListener("network:changed", handler);
		},
	},
	uploads: {
		list: () => ipcRenderer.invoke("uploads:list"),
		pause: (id) => ipcRenderer.invoke("uploads:pause", id),
		resume: (id) => ipcRenderer.invoke("uploads:resume", id),
		pauseAll: () => ipcRenderer.invoke("uploads:pause-all"),
		resumeAll: () => ipcRenderer.invoke("uploads:resume-all"),
		onChange: (listener) => {
			const handler = (_event, list) => listener(list);
			ipcRenderer.on("uploads:changed", handler);
			return () => ipcRenderer.removeListener("uploads:changed", handler);
		},
	},
	windows: {
		report: (args) => ipcRenderer.invoke("windows:report", args),
		open: (args) => ipcRenderer.invoke("windows:open", args),
		take: (args) => ipcRenderer.invoke("windows:take", args),
		moveToMain: (args) => ipcRenderer.invoke("windows:move-to-main", args),
		isMain: () => ipcRenderer.invoke("windows:is-main"),
		onNavigate: (listener) => {
			const handler = (_event, url) => listener(url);
			ipcRenderer.on("windows:navigate", handler);
			return () => ipcRenderer.removeListener("windows:navigate", handler);
		},
	},
	// Production exports through the bundled FFmpeg (EX-15) and MP3/M4A (EX-12).
	master: {
		codecs: () => ipcRenderer.invoke("master:codecs"),
		start: (args) => ipcRenderer.invoke("master:start", args),
		frame: (args) => ipcRenderer.invoke("master:frame", args),
		finish: (args) => ipcRenderer.invoke("master:finish", args),
		cancel: (args) => ipcRenderer.invoke("master:cancel", args),
		save: (args) => ipcRenderer.invoke("master:save", args),
		encodeAudio: (args) => ipcRenderer.invoke("master:encode-audio", args),
		muxAudio: (args) => ipcRenderer.invoke("master:mux-audio", args),
		convertImage: (args) => ipcRenderer.invoke("master:convert-image", args),
		encodeStill: (args) => ipcRenderer.invoke("master:encode-still", args),
	},
	helper: {
		caps: () => ipcRenderer.invoke("helper:caps"),
		configure: (args) => ipcRenderer.invoke("helper:configure", args),
		begin: () => ipcRenderer.invoke("helper:begin"),
		write: (args) => ipcRenderer.invoke("helper:write", args),
		proxy: (args) => ipcRenderer.invoke("helper:proxy", args),
		sphere: (args) => ipcRenderer.invoke("helper:sphere", args),
		read: (args) => ipcRenderer.invoke("helper:read", args),
		release: (args) => ipcRenderer.invoke("helper:release", args),
		onProgress: (listener) => {
			const handler = (_event, payload) => listener(payload);
			ipcRenderer.on("helper:progress", handler);
			return () => ipcRenderer.removeListener("helper:progress", handler);
		},
	},
	automation: {
		getState: () => ipcRenderer.invoke("automation:get-state"),
		setEnabled: (enabled) => ipcRenderer.invoke("automation:set-enabled", enabled),
		emit: (topic, data) => ipcRenderer.send("automation:event", { topic, data }),
		// The page runs editor methods for the local automation API.
		onCall: (handler) => {
			const listener = async (_event, { id, method, params }) => {
				try {
					ipcRenderer.send("automation:reply", { id, result: await handler(method, params) });
				} catch (error) {
					ipcRenderer.send("automation:reply", {
						id,
						error: { code: error?.code ?? -32000, message: error?.message ?? String(error) },
					});
				}
			};
			ipcRenderer.on("automation:call", listener);
			return () => ipcRenderer.removeListener("automation:call", listener);
		},
	},
	ai: {
		getState: () => ipcRenderer.invoke("ai:get-state"),
		setKey: (args) => ipcRenderer.invoke("ai:set-key", args),
		clearKey: (args) => ipcRenderer.invoke("ai:clear-key", args),
		test: (args) => ipcRenderer.invoke("ai:test", args),
		generate: (args) => ipcRenderer.invoke("ai:generate", args),
		cancel: () => ipcRenderer.invoke("ai:cancel"),
	},
	folders: {
		get: (args) => ipcRenderer.invoke("folders:get", args),
		create: (args) => ipcRenderer.invoke("folders:create", args),
		open: () => ipcRenderer.invoke("folders:open"),
		attach: (args) => ipcRenderer.invoke("folders:attach", args),
		unlink: (args) => ipcRenderer.invoke("folders:unlink", args),
		writeJson: (args) => ipcRenderer.invoke("folders:write-json", args),
		listMedia: (args) => ipcRenderer.invoke("folders:list-media", args),
		writeMedia: (args) => ipcRenderer.invoke("folders:write-media", args),
		readMedia: (args) => ipcRenderer.invoke("folders:read-media", args),
		removeMedia: (args) => ipcRenderer.invoke("folders:remove-media", args),
		show: (args) => ipcRenderer.invoke("folders:show", args),
		move: (args) => ipcRenderer.invoke("folders:move", args),
	},
	tools: {
		/** The file's place on disk (dropped or chosen files only). */
		pathForFile: (file) => webUtils.getPathForFile(file),
		convert: (args) => ipcRenderer.invoke("tools:convert", args),
		cancelConvert: (jobId) => ipcRenderer.invoke("tools:cancel-convert", jobId),
		download: (args) => ipcRenderer.invoke("tools:download", args),
		cancelDownload: (jobId) => ipcRenderer.invoke("tools:cancel-download", jobId),
		onDownloadProgress: (listener) => {
			const handler = (_event, payload) => listener(payload);
			ipcRenderer.on("tools:download-progress", handler);
			return () => ipcRenderer.removeListener("tools:download-progress", handler);
		},
		readSaved: (filePath) => ipcRenderer.invoke("tools:read-saved", filePath),
		onConvertProgress: (listener) => {
			const handler = (_event, payload) => listener(payload);
			ipcRenderer.on("tools:convert-progress", handler);
			return () => ipcRenderer.removeListener("tools:convert-progress", handler);
		},
	},
	recorder: {
		open: () => ipcRenderer.invoke("recorder:open"),
		focusMain: () => ipcRenderer.invoke("recorder:focus-main"),
		minimize: () => ipcRenderer.invoke("recorder:minimize"),
	},
	files: {
		saveExport: (args) => ipcRenderer.invoke("files:save-export", args),
		saveToFolder: (args) => ipcRenderer.invoke("files:save-to-folder", args),
		show: (filePath) => ipcRenderer.invoke("files:show", filePath),
	},
	cloud: {
		uploadAndShare: (args) => ipcRenderer.invoke("cloud:upload-share", args),
		cancel: () => ipcRenderer.invoke("cloud:cancel"),
		sync: (operation, args) => ipcRenderer.invoke("cloud:sync", operation, args),
		copy: (text) => ipcRenderer.invoke("clipboard:write", text),
		onProgress: (listener) => {
			const handler = (_event, progress) => listener(progress);
			ipcRenderer.on("cloud:progress", handler);
			return () => ipcRenderer.removeListener("cloud:progress", handler);
		},
	},
	// Asset Library (download center packs). Only pack ids and settings cross.
	assets: {
		getState: () => ipcRenderer.invoke("assets:get-state"),
		refresh: () => ipcRenderer.invoke("assets:refresh"),
		install: (packId) => ipcRenderer.invoke("assets:install", String(packId)),
		pause: (packId) => ipcRenderer.invoke("assets:pause", String(packId)),
		resume: (packId) => ipcRenderer.invoke("assets:resume", String(packId)),
		cancel: (packId) => ipcRenderer.invoke("assets:cancel", String(packId)),
		uninstall: (packId) => ipcRenderer.invoke("assets:uninstall", String(packId)),
		clearUnused: () => ipcRenderer.invoke("assets:clear-unused"),
		diskUsage: () => ipcRenderer.invoke("assets:disk-usage"),
		configure: (settings) => ipcRenderer.invoke("assets:configure", settings),
		updateAll: () => ipcRenderer.invoke("assets:update-all"),
		setFavorite: ({ packId, on } = {}) => ipcRenderer.invoke("assets:favorite", String(packId), on === true),
		history: (args) => ipcRenderer.invoke("assets:history", { cursor: args?.cursor ?? null, limit: Number(args?.limit) || 50 }),
		registerDevice: () => ipcRenderer.invoke("assets:register-device"),
		onChange: (listener) => {
			const handler = (_event, state) => listener(state);
			ipcRenderer.on("assets:changed", handler);
			return () => ipcRenderer.removeListener("assets:changed", handler);
		},
	},
	updates: {
		getState: () => ipcRenderer.invoke("updates:get-state"),
		check: () => ipcRenderer.invoke("updates:check"),
		download: () => ipcRenderer.invoke("updates:download"),
		install: () => ipcRenderer.invoke("updates:install"),
		configure: (settings) => ipcRenderer.invoke("updates:configure", settings),
		onChange: (listener) => {
			const handler = (_event, state) => listener(state);
			ipcRenderer.on("updates:changed", handler);
			return () => ipcRenderer.removeListener("updates:changed", handler);
		},
	},
	account: {
		getState: () => ipcRenderer.invoke("account:get-state"),
		signIn: () => ipcRenderer.invoke("account:sign-in", { signup: false }),
		signUp: () => ipcRenderer.invoke("account:sign-in", { signup: true }),
		cancelSignIn: () => ipcRenderer.invoke("account:cancel"),
		reopenSignIn: () => ipcRenderer.invoke("account:reopen"),
		switchWorkspace: (id) => ipcRenderer.invoke("account:switch-workspace", id),
		signOut: () => ipcRenderer.invoke("account:sign-out"),
		manage: () => ipcRenderer.invoke("account:manage"),
		onChange: (listener) => {
			const handler = (_event, state) => listener(state);
			ipcRenderer.on("account:changed", handler);
			return () => ipcRenderer.removeListener("account:changed", handler);
		},
	},
});
