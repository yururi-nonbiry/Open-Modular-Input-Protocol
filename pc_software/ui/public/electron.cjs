const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const robot = require('robotjs');

let tray = null;
let win = null;
let pythonProcess = null;
let currentVolume = 0.5; // Initial assumed volume
let windowWatcherInterval = null;

async function startWindowWatcher() {
    let lastActiveApp = null;
    const { activeWin } = await import('active-win');

    windowWatcherInterval = setInterval(async () => {
        try {
            const active = await activeWin();
            if (active && active.owner.name !== lastActiveApp) {
                lastActiveApp = active.owner.name;
                console.log(`Active window changed to: ${lastActiveApp}`);
                if (win) {
                    win.webContents.send('active-window-changed', lastActiveApp);
                }
            }
        } catch (e) {
            console.error("Could not get active window:", e);
        }
    }, 1000);
}

// Function to start the Python server
function startPythonServer() {
    let pythonExecutable, pythonScript;

    if (app.isPackaged) {
        // In production, the python executable and script are in the resources path
        pythonExecutable = path.join(process.resourcesPath, 'venv', 'Scripts', 'python.exe');
        pythonScript = path.join(process.resourcesPath, 'main.py');
    } else {
        // In development, use relative paths
        pythonExecutable = path.join(__dirname, '../../venv/Scripts/python.exe');
        pythonScript = path.join(__dirname, '../../main.py');
    }

    pythonProcess = spawn(pythonExecutable, [pythonScript]);

    pythonProcess.stdout.on('data', (data) => {
        console.log(`Python stdout: ${data}`);
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`Python stderr: ${data}`);
    });

    pythonProcess.on('close', (code) => {
        console.log(`Python process exited with code ${code}`);
    });
}

function createWindow() {
    // Create the browser window.
    win = new BrowserWindow({
        width: 800,
        height: 600,
        show: true, // Hide the window initially
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    // In development, load from the Vite dev server. In production, load the built file.
    const isDev = !app.isPackaged;
    const startUrl = isDev ? 'http://localhost:5173' : `file://${path.join(__dirname, '../build/index.html')}`;
    
    // Wait for the Python server to start before loading the URL
    setTimeout(() => {
        win.loadURL(startUrl);
    }, 5000); // 5-second delay


    // Open the DevTools.
    if (process.env.ELECTRON_START_URL) {
        win.webContents.openDevTools();
    }

    // Hide the window instead of closing it.
    win.on('close', (event) => {
        if (app.quitting) {
            win = null;
        } else {
            event.preventDefault();
            win.hide();
        }
    });
}

function createTray() {
    const iconPath = path.join(__dirname, 'vite.svg'); // Path to your icon
    tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
        {
            label: '設定',
            click: () => {
                win.show();
            },
        },
        {
            label: '終了',
            click: () => {
                app.quitting = true;
                app.quit();
            },
        },
    ]);
    tray.setToolTip('Open Modular Input Protocol');
    tray.setContextMenu(contextMenu);
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
    startPythonServer();
    createWindow();
    createTray();
    startWindowWatcher();

    ipcMain.on('execute-shortcut', (event, shortcut) => {
        try {
            console.log(`Received shortcut to execute: ${shortcut}`);
            const keys = shortcut.toLowerCase().split('+').map(k => k.trim());
            const mainKey = keys.pop();
            const modifiers = keys;
            
            if (mainKey) {
                robot.keyTap(mainKey, modifiers);
                console.log(`Executed: keyTap("${mainKey}", [${modifiers.join(', ')}])`);
            }
        } catch (e) {
            console.error("Failed to execute shortcut:", e);
        }
    });

    ipcMain.on('set-volume', (event, volume) => {
        try {
            // A simple approach: tap up or down based on change.
            // A more robust solution would involve getting actual system volume.
            const volumeThreshold = 0.05; // Only change if difference is significant
            if (volume > currentVolume + volumeThreshold) {
                robot.keyTap('audio_vol_up');
                console.log('Volume up');
            } else if (volume < currentVolume - volumeThreshold) {
                robot.keyTap('audio_vol_down');
                console.log('Volume down');
            }
            currentVolume = volume;
        } catch (e) {
            console.error("Failed to set volume:", e);
        }
    });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
    // Do nothing, the app should stay open.
});

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Kill the python process before the app quits
app.on('will-quit', () => {
    if (pythonProcess) {
        pythonProcess.kill();
        pythonProcess = null;
    }
    if (windowWatcherInterval) {
        clearInterval(windowWatcherInterval);
    }
});
