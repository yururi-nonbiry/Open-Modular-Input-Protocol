import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import readline from "node:readline";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
process.env.DIST = path.join(__dirname, "../dist");
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL ? path.join(process.env.DIST, "../public") : process.env.DIST;
let win;
let pythonProcess = null;
let stdoutReader = null;
const pendingResponses = /* @__PURE__ */ new Map();
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      // Recommended for security
      nodeIntegration: false
      // Recommended for security
    }
  });
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(process.env.DIST, "index.html"));
  }
}
function startPythonBackend() {
  const pythonExecutable = path.join(__dirname, "../../venv/Scripts/python.exe");
  const backendScript = path.join(__dirname, "../../backend.py");
  pythonProcess = spawn(pythonExecutable, [backendScript]);
  if (!pythonProcess.stdout || !pythonProcess.stdin) {
    const message = "Failed to establish pipes for Python backend.";
    console.error(message);
    rejectAllPending(message);
    pythonProcess.kill();
    pythonProcess = null;
    return;
  }
  stdoutReader = readline.createInterface({ input: pythonProcess.stdout });
  stdoutReader.on("line", (line) => {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      handleBackendMessage(trimmed);
    }
  });
  stdoutReader.on("error", (err) => {
    console.error("Failed to read Python stdout:", err);
    win?.webContents.send("from-backend-error", `Stdout error: ${err instanceof Error ? err.message : String(err)}`);
  });
  pythonProcess.stderr?.setEncoding("utf8");
  pythonProcess.stderr?.on("data", (data) => {
    console.error(`Python stderr: ${data}`);
    win?.webContents.send("from-backend-error", data.toString());
  });
  pythonProcess.on("close", (code, signal) => {
    console.log(`Python process closed (code=${code}, signal=${signal ?? "n/a"})`);
    stdoutReader?.close();
    stdoutReader = null;
    rejectAllPending(`Python process closed (code=${code}, signal=${signal ?? "n/a"})`);
    pythonProcess = null;
  });
  pythonProcess.on("error", (error) => {
    console.error("Failed to launch Python backend:", error);
    win?.webContents.send("from-backend-error", `Python spawn error: ${error instanceof Error ? error.message : String(error)}`);
    stdoutReader?.close();
    stdoutReader = null;
    rejectAllPending(`Python backend launch error: ${error instanceof Error ? error.message : String(error)}`);
    pythonProcess = null;
  });
}
function sendToPython(command) {
  if (!pythonProcess || !pythonProcess.stdin) {
    throw new Error("Python process not running.");
  }
  pythonProcess.stdin.write(JSON.stringify(command) + "\n");
}
function handleBackendMessage(raw) {
  win?.webContents.send("from-backend", raw);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.warn("Failed to parse backend message as JSON:", raw, error);
    return;
  }
  if (parsed.command) {
    fulfillPendingResponse(parsed);
  }
}
function fulfillPendingResponse(response) {
  if (!response.command) {
    return;
  }
  const queue = pendingResponses.get(response.command);
  if (!queue?.length) {
    return;
  }
  const { resolve, reject } = queue.shift();
  if (response.status && response.status !== "success") {
    const message = typeof response.message === "string" ? response.message : `Backend command "${response.command}" failed`;
    reject(new Error(message));
  } else {
    resolve(response);
  }
  if (queue.length === 0) {
    pendingResponses.delete(response.command);
  }
}
function rejectAllPending(message) {
  for (const queue of pendingResponses.values()) {
    for (const pending of queue) {
      pending.reject(new Error(message));
    }
  }
  pendingResponses.clear();
}
function requestBackend(payload, expectedCommand) {
  return new Promise((resolve, reject) => {
    if (!pythonProcess) {
      reject(new Error("Python process not running."));
      return;
    }
    const queue = pendingResponses.get(expectedCommand) ?? [];
    const pending = {
      resolve: (response) => resolve(response),
      reject
    };
    queue.push(pending);
    pendingResponses.set(expectedCommand, queue);
    try {
      sendToPython(payload);
    } catch (error) {
      queue.pop();
      if (queue.length === 0) {
        pendingResponses.delete(expectedCommand);
      } else {
        pendingResponses.set(expectedCommand, queue);
      }
      reject(error);
    }
  });
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (pythonProcess) {
      pythonProcess.kill();
    }
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(() => {
  startPythonBackend();
  createWindow();
  ipcMain.handle("serial:get_ports", async () => {
    const response = await requestBackend({ type: "get_ports" }, "get_ports");
    return Array.isArray(response.ports) ? response.ports : [];
  });
  ipcMain.handle("serial:connect", async (event, port) => {
    await requestBackend({ type: "connect", port }, "connect");
  });
  ipcMain.handle("serial:disconnect", async () => {
    await requestBackend({ type: "disconnect" }, "disconnect");
  });
  ipcMain.handle("config:get", async () => {
    const response = await requestBackend({ type: "get_config" }, "get_config");
    return response.config ?? {};
  });
  ipcMain.handle("config:save", async (event, config) => {
    try {
      sendToPython({ type: "save_config", config });
    } catch (error) {
      console.error("Failed to send save_config to backend", error);
      throw error;
    }
  });
  ipcMain.handle("config:set_page", async (event, page) => {
    try {
      sendToPython({ type: "set_page", page });
    } catch (error) {
      console.error("Failed to send set_page to backend", error);
      throw error;
    }
  });
  ipcMain.handle("image:get_base64", async (_event, filePath) => {
    try {
      if (!filePath) {
        return null;
      }
      if (filePath.startsWith("data:")) {
        return filePath;
      }
      const data = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase().substring(1);
      const mappedExt = ext === "jpg" ? "jpeg" : ext;
      const mimeType = mappedExt ? `image/${mappedExt}` : "image/png";
      return `data:${mimeType};base64,${data.toString("base64")}`;
    } catch (err) {
      console.error(`Failed to read image file: ${filePath}`, err);
      return null;
    }
  });
});
