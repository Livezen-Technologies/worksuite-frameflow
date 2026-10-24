const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("overlay", {
	on: (channel, listener) => {
		if (!["overlay:click", "overlay:key", "overlay:masks", "overlay:move", "overlay:style"].includes(channel)) return;
		ipcRenderer.on(channel, (_event, payload) => listener(payload));
	},
});
