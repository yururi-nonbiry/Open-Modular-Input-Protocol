import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';

// ESM-safe __dirname replacement
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(process.env.DIST, '../public')
  : process.env.DIST;

let win: BrowserWindow | null;
let pythonProcess: ChildProcessWithoutNullStreams | null = null;

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // Recommended for security
      nodeIntegration: false, // Recommended for security
    },
  });

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString());
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(process.env.DIST, 'index.html'));
  }
}

function startPythonBackend() {
  const pythonExecutable = path.join(__dirname, '../../venv/Scripts/python.exe');
  const backendScript = path.join(__dirname, '../../backend.py');

  pythonProcess = spawn(pythonExecutable, [backendScript]);

  pythonProcess.stdout.on('data', (data) => {
    const message = data.toString();
    // Forward backend messages to the renderer process
    win?.webContents.send('from-backend', message);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`Python stderr: ${data}`);
    win?.webContents.send('from-backend-error', data.toString());
  });

  pythonProcess.on('close', (code) => {
    console.log(`Python process exited with code ${code}`);
    pythonProcess = null;
  });
}

function sendToPython(command: object) {
  if (pythonProcess) {
    pythonProcess.stdin.write(JSON.stringify(command) + '\n');
  } else {
    console.error('Python process not running.');
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (pythonProcess) {
      pythonProcess.kill();
    }
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
  startPythonBackend();
  createWindow();

  // --- IPC Handlers ---
  ipcMain.handle('serial:get_ports', async () => {
    return new Promise((resolve, reject) => {
      const handler = (event: any, message: string) => {
        try {
          const response = JSON.parse(message);
          if (response.command === 'get_ports') {
            win?.webContents.removeListener('from-backend', handler);
            if(response.status === 'success') {
              resolve(response.ports);
            } else {
              reject(new Error(response.message || 'Failed to get ports'));
            }
          }
        } catch (e) {}
      };
      win?.webContents.on('from-backend', handler);
      sendToPython({ type: 'get_ports' });
    });
  });

  ipcMain.handle('serial:connect', async (event, port: string) => {
    return new Promise<void>((resolve, reject) => {
      const handler = (event: any, message: string) => {
        try {
          const response = JSON.parse(message);
          if (response.command === 'connect') {
            win?.webContents.removeListener('from-backend', handler);
            if(response.status === 'success') {
              resolve();
            } else {
              reject(new Error(response.message || 'Failed to connect'));
            }
          }
        } catch (e) {}
      };
      win?.webContents.on('from-backend', handler);
      sendToPython({ type: 'connect', port });
    });
  });

  ipcMain.handle('serial:disconnect', async () => {
    return new Promise<void>((resolve, reject) => {
      const handler = (event: any, message: string) => {
        try {
          const response = JSON.parse(message);
          if (response.command === 'disconnect') {
            win?.webContents.removeListener('from-backend', handler);
            if(response.status === 'success') {
              resolve();
            } else {
              reject(new Error(response.message || 'Failed to disconnect'));
            }
          }
        } catch (e) {}
      };
      win?.webContents.on('from-backend', handler);
      sendToPython({ type: 'disconnect' });
    });
  });

  ipcMain.handle('config:get', async () => {
    return new Promise((resolve, reject) => {
      const handler = (event: any, message: string) => {
        try {
          const response = JSON.parse(message);
          if (response.command === 'get_config') {
            win?.webContents.removeListener('from-backend', handler);
            if(response.status === 'success') {
              resolve(response.config);
            } else {
              reject(new Error(response.message || 'Failed to get config'));
            }
          }
        } catch (e) {}
      };
      win?.webContents.on('from-backend', handler);
      sendToPython({ type: 'get_config' });
    });
  });

  ipcMain.handle('config:save', async (event, config: any) => {
    // This is a fire-and-forget operation from the UI's perspective,
    // but we can still check for a backend confirmation.
    sendToPython({ type: 'save_config', config });
  });

  ipcMain.handle('config:set_page', async (event, page: number) => {
    sendToPython({ type: 'set_page', page });
  });

});
