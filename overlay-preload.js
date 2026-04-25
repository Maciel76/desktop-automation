const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayAPI', {
  getCursorPosition: () => ipcRenderer.invoke('get-cursor-position'),
  done: (coords) => ipcRenderer.invoke('pick-location-done', coords),
  cancel: () => ipcRenderer.invoke('cancel-pick-location'),
});
