import { app as p, BrowserWindow as I, ipcMain as d, nativeImage as P } from "electron";
import i from "node:path";
import h from "node:fs/promises";
import { fileURLToPath as R } from "node:url";
import { spawn as U } from "node:child_process";
import $ from "node:readline";
import { randomUUID as T } from "node:crypto";
const N = R(import.meta.url), _ = i.dirname(N);
process.env.DIST = i.join(_, "../dist");
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL ? i.join(process.env.DIST, "../public") : process.env.DIST;
let c, a = null, u = null;
const g = /* @__PURE__ */ new Map(), S = process.env.VITE_DEV_SERVER_URL, k = 160;
let y = null;
function D() {
  c = new I({
    icon: i.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: i.join(_, "preload.js"),
      contextIsolation: !0,
      // Recommended for security
      nodeIntegration: !1
      // Recommended for security
    }
  }), c.webContents.on("did-finish-load", () => {
    c?.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  }), S ? (c.loadURL(S), c.webContents.openDevTools()) : c.loadFile(i.join(process.env.DIST, "index.html"));
}
function V() {
  const n = i.join(_, "../../venv/Scripts/python.exe"), t = i.join(_, "../../backend.py");
  if (a = U(n, [t]), !a.stdout || !a.stdin) {
    const e = "Failed to establish pipes for Python backend.";
    console.error(e), b(e), a.kill(), a = null;
    return;
  }
  u = $.createInterface({ input: a.stdout }), u.on("line", (e) => {
    const o = e.trim();
    o.length > 0 && B(o);
  }), u.on("error", (e) => {
    console.error("Failed to read Python stdout:", e), c?.webContents.send("from-backend-error", `Stdout error: ${e instanceof Error ? e.message : String(e)}`);
  }), a.stderr?.setEncoding("utf8"), a.stderr?.on("data", (e) => {
    console.error(`Python stderr: ${e}`), c?.webContents.send("from-backend-error", e.toString());
  }), a.on("close", (e, o) => {
    console.log(`Python process closed (code=${e}, signal=${o ?? "n/a"})`), u?.close(), u = null, b(`Python process closed (code=${e}, signal=${o ?? "n/a"})`), a = null;
  }), a.on("error", (e) => {
    console.error("Failed to launch Python backend:", e), c?.webContents.send("from-backend-error", `Python spawn error: ${e instanceof Error ? e.message : String(e)}`), u?.close(), u = null, b(`Python backend launch error: ${e instanceof Error ? e.message : String(e)}`), a = null;
  });
}
function E(n) {
  if (!a || !a.stdin)
    throw new Error("Python process not running.");
  a.stdin.write(JSON.stringify(n) + `
`);
}
function B(n) {
  c?.webContents.send("from-backend", n);
  let t;
  try {
    t = JSON.parse(n);
  } catch (e) {
    console.warn("Failed to parse backend message as JSON:", n, e);
    return;
  }
  t.command && L(t);
}
function L(n) {
  if (!n.command)
    return;
  const t = g.get(n.command);
  if (!t?.length)
    return;
  const { resolve: e, reject: o } = t.shift();
  if (n.status && n.status !== "success") {
    const r = typeof n.message == "string" ? n.message : `Backend command "${n.command}" failed`;
    o(new Error(r));
  } else
    e(n);
  t.length === 0 && g.delete(n.command);
}
function b(n) {
  for (const t of g.values())
    for (const e of t)
      e.reject(new Error(n));
  g.clear();
}
function w(n, t) {
  return new Promise((e, o) => {
    if (!a) {
      o(new Error("Python process not running."));
      return;
    }
    const r = g.get(t) ?? [], l = {
      resolve: (f) => e(f),
      reject: o
    };
    r.push(l), g.set(t, r);
    try {
      E(n);
    } catch (f) {
      r.pop(), r.length === 0 ? g.delete(t) : g.set(t, r), o(f);
    }
  });
}
p.on("window-all-closed", () => {
  process.platform !== "darwin" && (a && a.kill(), p.quit(), c = null);
});
p.on("activate", () => {
  I.getAllWindows().length === 0 && D();
});
p.whenReady().then(async () => {
  V(), D();
  try {
    y = i.join(p.getPath("userData"), "icons"), await h.mkdir(y, { recursive: !0 });
  } catch (n) {
    console.error("Failed to prepare icon storage directory:", n), y = null;
  }
  d.handle("serial:get_ports", async () => {
    const n = await w({ type: "get_ports" }, "get_ports");
    return Array.isArray(n.ports) ? n.ports : [];
  }), d.handle("serial:connect", async (n, t) => {
    await w({ type: "connect", port: t }, "connect");
  }), d.handle("serial:disconnect", async () => {
    await w({ type: "disconnect" }, "disconnect");
  }), d.handle("config:get", async () => (await w({ type: "get_config" }, "get_config")).config ?? {}), d.handle("config:save", async (n, t) => {
    try {
      E({ type: "save_config", config: t });
    } catch (e) {
      throw console.error("Failed to send save_config to backend", e), e;
    }
  }), d.handle("config:set_page", async (n, t) => {
    try {
      E({ type: "set_page", page: t });
    } catch (e) {
      throw console.error("Failed to send set_page to backend", e), e;
    }
  }), d.handle("image:import_and_resize", async (n, t) => {
    const e = typeof t?.filePath == "string" && t.filePath.length > 0 ? t.filePath : null, o = typeof t?.dataUrl == "string" && t.dataUrl.length > 0 ? t.dataUrl : null;
    if (!e && !o)
      throw new Error("No image data provided for import.");
    let r = null;
    if (e)
      try {
        const m = await h.readFile(e);
        r = P.createFromBuffer(m);
      } catch (m) {
        console.warn(`Failed to load image from file path (${e}):`, m);
      }
    if ((!r || r.isEmpty()) && o && (r = P.createFromDataURL(o)), !r || r.isEmpty())
      throw new Error("Failed to load source image.");
    const l = r.resize({ width: k, height: k, quality: "best" });
    if (l.isEmpty())
      throw new Error("Failed to resize image.");
    const f = l.toJPEG(90), s = y ?? i.join(p.getPath("userData"), "icons");
    try {
      await h.mkdir(s, { recursive: !0 });
    } catch (m) {
      console.warn("Failed to ensure icon storage directory exists:", m);
    }
    const F = `icon-${Date.now()}-${T()}.jpg`, v = i.join(s, F);
    await h.writeFile(v, f);
    const j = `data:image/jpeg;base64,${f.toString("base64")}`;
    return { storedPath: v, dataUrl: j };
  }), d.handle("image:get_base64", async (n, t) => {
    try {
      if (!t)
        return null;
      if (t.startsWith("data:"))
        return t;
      const e = await h.readFile(t), o = i.extname(t).toLowerCase().substring(1), r = o === "jpg" ? "jpeg" : o;
      return `data:${r ? `image/${r}` : "image/png"};base64,${e.toString("base64")}`;
    } catch (e) {
      return console.error(`Failed to read image file: ${t}`, e), null;
    }
  }), d.handle("image:upload", async (n, t) => {
    const { screenId: e, page: o, filePath: r, dataUrl: l, clear: f } = t ?? {};
    if (typeof e != "number" || Number.isNaN(e))
      throw new Error("screenId is required for image upload.");
    const s = {
      type: "send_image",
      screen_id: e
    };
    if (typeof o == "number" && !Number.isNaN(o) && (s.page = o), r && i.isAbsolute(r) && (s.file_path = r), f === !0 && (s.clear = !0), !s.file_path && !s.clear && typeof l == "string" && l.length > 0 && (s.data_url = l), !s.file_path && !s.data_url && !s.clear)
      throw new Error("No image data provided for upload.");
    await w(s, "send_image");
  });
});
