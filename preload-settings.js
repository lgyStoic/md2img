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
  },
  // Token 统计相关
  getTokenStats: () => {
    ipcRenderer.send('get-token-stats');
  },
  resetTokenStats: () => {
    ipcRenderer.send('reset-token-stats');
  },
  onTokenStats: (callback) => {
    ipcRenderer.on('token-stats-data', (event, stats) => {
      callback(stats);
    });
  },
  onTokenStatsReset: (callback) => {
    ipcRenderer.on('token-stats-reset', (event, stats) => {
      callback(stats);
    });
  }
});
