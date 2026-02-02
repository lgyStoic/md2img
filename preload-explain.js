// Preload script for explain dialog
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronExplain', {
  cancel: () => {
    ipcRenderer.send('explain-cancel');
  },
  copy: (text) => {
    ipcRenderer.send('explain-copy', text);
  },
  // 流式更新相关
  onStreamChunk: (callback) => {
    ipcRenderer.on('explain-stream-chunk', (event, chunk, fullContent) => {
      callback(chunk, fullContent);
    });
  },
  onStreamDone: (callback) => {
    ipcRenderer.on('explain-stream-done', (event, fullContent) => {
      callback(fullContent);
    });
  },
  onStreamError: (callback) => {
    ipcRenderer.on('explain-stream-error', (event, error) => {
      callback(error);
    });
  }
});
