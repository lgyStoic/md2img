// Preload script for grammar correction dialog
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronGrammar', {
  cancel: () => {
    ipcRenderer.send('grammar-confirm', false);
  },
  replace: (newText) => {
    ipcRenderer.send('grammar-replace', newText);
  }
});
