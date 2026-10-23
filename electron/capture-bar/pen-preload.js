const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pen", {
	close: () => ipcRenderer.send("pen:close"),
	onClear: (listener) => ipcRenderer.on("pen:clear", () => listener()),
});
