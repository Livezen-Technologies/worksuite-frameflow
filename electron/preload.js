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
