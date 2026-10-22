// Exposes the Worksuite account to the editor UI. Tokens never cross this
// bridge: the page only sees sign-in state and the cached profile.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("worksuite", {
	account: {
		getState: () => ipcRenderer.invoke("account:get-state"),
		signIn: () => ipcRenderer.invoke("account:sign-in", { signup: false }),
		signUp: () => ipcRenderer.invoke("account:sign-in", { signup: true }),
		cancelSignIn: () => ipcRenderer.invoke("account:cancel"),
		signOut: () => ipcRenderer.invoke("account:sign-out"),
		manage: () => ipcRenderer.invoke("account:manage"),
		onChange: (listener) => {
			const handler = (_event, state) => listener(state);
			ipcRenderer.on("account:changed", handler);
			return () => ipcRenderer.removeListener("account:changed", handler);
		},
	},
});
