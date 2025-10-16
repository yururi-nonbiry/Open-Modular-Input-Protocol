const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe, world-isolated API to the renderer process
contextBridge.exposeInMainWorld('electron', {
  /**
   * Sends a request to the main process to execute a keyboard shortcut.
   * @param {string} shortcut - The shortcut to execute (e.g., 'control+c').
   */
  executeShortcut: (shortcut) => {
    ipcRenderer.send('execute-shortcut', shortcut);
  },
  /**
   * Sends a request to the main process to set the system volume.
   * @param {number} volume - The desired volume level (0.0 to 1.0).
   */
  setVolume: (volume) => {
    ipcRenderer.send('set-volume', volume);
  },
  /**
   * Registers a listener for when the active window changes.
   * @param {function(string): void} callback - The function to call with the new app name.
   */
  onActiveWindowChange: (callback) => {
    ipcRenderer.on('active-window-changed', (event, appName) => {
        callback(appName);
    });
  },
});
