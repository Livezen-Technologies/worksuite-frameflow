const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("captureBar", {
	send: (command) => ipcRenderer.send("capture-bar:command", String(command)),
	onState: (listener) => ipcRenderer.on("capture-bar:state", (_event, state) => listener(state)),
});
