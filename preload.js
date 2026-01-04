// Preload script for secure context isolation
// This file runs in the renderer context but has access to Node.js APIs
// We don't need to expose anything special here since we're using data URLs

const { contextBridge } = require('electron');

// No special APIs needed - the renderer will work with the HTML template directly
contextBridge.exposeInMainWorld('electron', {
  // Placeholder for any future APIs if needed
});

