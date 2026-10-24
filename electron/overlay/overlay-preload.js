const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("overlay", {
	on: (channel, listener) => {
		if (!["overlay:click", "overlay:key", "overlay:masks"].includes(channel)) return;
		ipcRenderer.on(channel, (_event, payload) => listener(payload));
	},
});
