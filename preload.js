const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  saveConfig: (config) => ipcRenderer.invoke("save-config", config),
  sendTestCode: (codigo) => ipcRenderer.invoke("send-test-code", codigo),
  toggleRunning: () => ipcRenderer.invoke("toggle-running"),
  clearQueue: () => ipcRenderer.invoke("clear-queue"),
  getLogs: () => ipcRenderer.invoke("get-logs"),
  getWsPort: () => ipcRenderer.invoke("get-ws-port"),
  startPickLocation: () => ipcRenderer.invoke("start-pick-location"),

  onStatusUpdate: (cb) =>
    ipcRenderer.on("status-update", (_, data) => cb(data)),
  onConnectionUpdate: (cb) =>
    ipcRenderer.on("connection-update", (_, data) => cb(data)),
  onRunningUpdate: (cb) =>
    ipcRenderer.on("running-update", (_, data) => cb(data)),
  onLogEntry: (cb) => ipcRenderer.on("log-entry", (_, data) => cb(data)),
  onPickLocationResult: (cb) =>
    ipcRenderer.on("pick-location-result", (_, data) => cb(data)),
  onPickLocationCancelled: (cb) =>
    ipcRenderer.on("pick-location-cancelled", (_, data) => cb(data)),

  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});
