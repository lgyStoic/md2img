// Preload script for translate dialog
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronTranslate', {
  cancel: () => {
    ipcRenderer.send('translate-cancel');
  },
  copy: (text) => {
    ipcRenderer.send('translate-copy', text);
  },
  replace: (text) => {
    ipcRenderer.send('translate-replace', text);
  }
});
