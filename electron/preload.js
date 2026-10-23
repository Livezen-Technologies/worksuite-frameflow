// Exposes the Worksuite account to the editor UI. Tokens never cross this
// bridge: the page only sees sign-in state and the cached profile.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("worksuite", {
	app: {
		getVersion: () => ipcRenderer.invoke("app:version"),
	},
	capture: {
		sources: () => ipcRenderer.invoke("capture:sources"),
		choose: (id) => ipcRenderer.invoke("capture:choose", id),
		permissions: () => ipcRenderer.invoke("capture:permissions"),
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
	ai: {
		getState: () => ipcRenderer.invoke("ai:get-state"),
		setKey: (args) => ipcRenderer.invoke("ai:set-key", args),
		clearKey: () => ipcRenderer.invoke("ai:clear-key"),
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
	files: {
		saveExport: (args) => ipcRenderer.invoke("files:save-export", args),
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
