// Preload script for settings window
const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('electronSettings', {
  save: (config) => {
    ipcRenderer.send('save-settings', config);
  },
  close: () => {
    ipcRenderer.send('close-settings');
  },
  openExternal: (url) => {
    shell.openExternal(url);
  },
  onSaved: (callback) => {
    ipcRenderer.on('settings-saved', (event, success) => {
      callback(success);
    });
  }
});
