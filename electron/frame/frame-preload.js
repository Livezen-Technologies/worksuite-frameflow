const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("recFrame", {
	on: (channel, listener) => {
		if (!["frame:area", "frame:count", "frame:paused"].includes(channel)) return;
		ipcRenderer.on(channel, (_event, payload) => listener(payload));
	},
});
