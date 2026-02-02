// Preload script for explain dialog
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronExplain', {
  cancel: () => {
    ipcRenderer.send('explain-cancel');
  },
  copy: (text) => {
    ipcRenderer.send('explain-copy', text);
  }
});
