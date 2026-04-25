const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  screen,
  globalShortcut,
} = require("electron");
const path = require("path");
const fs = require("fs");
const { createWebSocketServer } = require("./src/communicationService");
const { createQueue } = require("./src/queueService");
const { executeAutomation } = require("./src/automationService");
const logger = require("./src/logger");

let mainWindow = null;
let tray = null;
let wsServer = null;
let queue = null;
let isRunning = true;
let overlayWindow = null;

// Load config
function loadConfig() {
  const configPath = path.join(app.getPath("userData"), "config.json");
  const defaultConfigPath = path.join(__dirname, "config.json");

  if (!fs.existsSync(configPath)) {
    fs.copyFileSync(defaultConfigPath, configPath);
  }

  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return JSON.parse(fs.readFileSync(defaultConfigPath, "utf8"));
  }
}

function saveConfig(config) {
  const configPath = path.join(app.getPath("userData"), "config.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}

function getConfigPath() {
  return path.join(app.getPath("userData"), "config.json");
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 600,
    minWidth: 480,
    minHeight: 500,
    resizable: true,
    title: "Automation Client",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.on("close", (e) => {
    e.preventDefault();
    mainWindow.hide();
  });
}

function createTray() {
  // Use a simple default icon
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.on("click", () => mainWindow && mainWindow.show());
  buildTrayMenu(false);
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  const config = loadConfig();

  // Create queue processor
  queue = createQueue(async (item) => {
    if (!isRunning) return;

    sendToRenderer("status-update", {
      status: "processing",
      currentCode: item.codigo,
      queueSize: queue.size(),
    });

    try {
      const currentConfig = loadConfig();

      if (currentConfig.minimizeBeforeAction && mainWindow) {
        mainWindow.minimize();
      }

      await executeAutomation(item.codigo, currentConfig);

      logger.info(`Código executado com sucesso: ${item.codigo}`);
      sendToRenderer("log-entry", {
        time: new Date().toISOString(),
        code: item.codigo,
        status: "success",
        message: "Automação executada com sucesso",
      });
    } catch (err) {
      logger.error(`Erro ao executar código ${item.codigo}: ${err.message}`);
      sendToRenderer("log-entry", {
        time: new Date().toISOString(),
        code: item.codigo,
        status: "error",
        message: err.message,
      });
      sendToRenderer("status-update", {
        status: "error",
        currentCode: null,
        queueSize: queue.size(),
      });
    }

    sendToRenderer("status-update", {
      status: queue.size() > 0 ? "processing" : "idle",
      currentCode: null,
      queueSize: queue.size(),
    });
  });

  // Start WebSocket server
  wsServer = createWebSocketServer(config.wsPort, {
    onCode: (codigo) => {
      if (!isRunning) {
        logger.warn(`Código recebido mas sistema pausado: ${codigo}`);
        return;
      }

      logger.info(`Código recebido: ${codigo}`);
      queue.add({ codigo });

      sendToRenderer("status-update", {
        status: "queued",
        currentCode: null,
        queueSize: queue.size(),
      });
    },
    onConnect: () => {
      sendToRenderer("connection-update", { connected: true });
    },
    onDisconnect: () => {
      sendToRenderer("connection-update", { connected: false });
    },
  });

  sendToRenderer("status-update", {
    status: "idle",
    currentCode: null,
    queueSize: 0,
  });
});

// IPC Handlers
ipcMain.handle("get-config", () => loadConfig());

ipcMain.handle("save-config", (event, config) => {
  try {
    saveConfig(config);
    // Restart WebSocket server on port change
    const currentConfig = loadConfig();
    if (wsServer && config.wsPort !== currentConfig.wsPort) {
      wsServer.close();
      wsServer = createWebSocketServer(config.wsPort, {
        onCode: (codigo) => {
          if (!isRunning) return;
          queue.add({ codigo });
          sendToRenderer("status-update", {
            status: "queued",
            currentCode: null,
            queueSize: queue.size(),
          });
        },
        onConnect: () =>
          sendToRenderer("connection-update", { connected: true }),
        onDisconnect: () =>
          sendToRenderer("connection-update", { connected: false }),
      });
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("send-test-code", (event, codigo) => {
  if (!isRunning) return { success: false, error: "Sistema pausado" };
  if (!codigo || !codigo.trim())
    return { success: false, error: "Código vazio" };

  logger.info(`Código de teste enviado manualmente: ${codigo}`);
  queue.add({ codigo: codigo.trim() });

  sendToRenderer("status-update", {
    status: "queued",
    currentCode: null,
    queueSize: queue.size(),
  });

  return { success: true };
});

ipcMain.handle("toggle-running", () => {
  isRunning = !isRunning;
  sendToRenderer("running-update", { running: isRunning });
  logger.info(`Sistema ${isRunning ? "retomado" : "pausado"}`);
  return { running: isRunning };
});

ipcMain.handle("clear-queue", () => {
  queue.clear();
  sendToRenderer("status-update", {
    status: "idle",
    currentCode: null,
    queueSize: 0,
  });
  return { success: true };
});

ipcMain.handle("get-logs", () => {
  try {
    const logPath = path.join(
      app.getPath("userData"),
      "logs",
      "automation.log",
    );
    if (!fs.existsSync(logPath)) return [];
    const content = fs.readFileSync(logPath, "utf8");
    return content
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(-100)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { message: line };
        }
      });
  } catch {
    return [];
  }
});

ipcMain.handle("get-ws-port", () => {
  const config = loadConfig();
  return config.wsPort || 9099;
});

// ── Tray menu helpers ─────────────────────────────────────────────────────────

function buildTrayMenu(picking = false) {
  const items = picking
    ? [
        { label: "🔴 Aguardando clique na tela...", enabled: false },
        { type: "separator" },
        {
          label: "Cancelar (ESC)",
          click: () => cancelPickLocation(),
        },
      ]
    : [
        { label: "Abrir", click: () => mainWindow && mainWindow.show() },
        { type: "separator" },
        {
          label: "Sair",
          click: () => {
            mainWindow.destroy();
            app.quit();
          },
        },
      ];
  tray.setContextMenu(Menu.buildFromTemplate(items));
  tray.setToolTip(
    picking ? "🔴 Clique em qualquer lugar da tela..." : "Automation Client",
  );
}

// ── Pick Location — PowerShell approach (no overlay window) ───────────────────
//
// Instead of an overlay / floating panel (both blocked by Windows 11 security),
// we hide the main window, run a tiny PowerShell script that uses Win32
// GetAsyncKeyState to wait for the NEXT left mouse click, reads CursorPos and
// outputs "X,Y". No focus, no transparency, no permissions needed.

let pickProcess = null;

function cancelPickLocation() {
  if (pickProcess) {
    try {
      pickProcess.kill();
    } catch {
      /* ignore */
    }
    pickProcess = null;
  }
  globalShortcut.unregister("Escape");
  buildTrayMenu(false);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    sendToRenderer("pick-location-cancelled", {});
  }
}

ipcMain.handle("get-cursor-position", () => {
  return screen.getCursorScreenPoint();
});

ipcMain.handle("start-pick-location", () => {
  if (pickProcess) return { success: true }; // already picking

  // Hide the window so the user can freely click anywhere on the screen
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();

  buildTrayMenu(true);

  // ESC emergency cancel via global shortcut (works without window focus)
  try {
    globalShortcut.register("Escape", cancelPickLocation);
  } catch {
    /* already registered */
  }

  // PowerShell script: wait for left-button RELEASE (to ignore the click that
  // opened Pick Location), then wait for the next LEFT PRESS, output "X,Y".
  // Also watches for ESC key to cancel cleanly.
  const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Threading;
public class MC {
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int v);
  public struct POINT { public int X; public int Y; }
  public static string Wait() {
    // release phase — wait until the button that opened the picker is released
    for (int i = 0; i < 200 && (GetAsyncKeyState(0x01) & 0x8000) != 0; i++) Thread.Sleep(20);
    // click phase — wait for the NEXT left press or ESC
    while (true) {
      if ((GetAsyncKeyState(0x01) & 0x8000) != 0) {
        POINT p; GetCursorPos(out p);
        return p.X + "," + p.Y;
      }
      if ((GetAsyncKeyState(0x1B) & 0x8000) != 0) return "cancel";
      Thread.Sleep(10);
    }
  }
}
"@
Write-Output ([MC]::Wait())
`;

  const { spawn } = require("child_process");
  let output = "";

  pickProcess = spawn("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-WindowStyle",
    "Hidden",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    psScript,
  ]);

  pickProcess.stdout.on("data", (d) => {
    output += d.toString();
  });

  pickProcess.on("close", (code) => {
    pickProcess = null;
    globalShortcut.unregister("Escape");
    buildTrayMenu(false);

    const result = output.trim();
    if (!result || result === "cancel" || code !== 0) {
      // Cancelled or errored — just show the window back
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
        sendToRenderer("pick-location-cancelled", {});
      }
      return;
    }

    const [xStr, yStr] = result.split(",");
    const x = parseInt(xStr, 10);
    const y = parseInt(yStr, 10);

    if (!isNaN(x) && !isNaN(y)) {
      const config = loadConfig();
      config.mouseX = x;
      config.mouseY = y;
      saveConfig(config);
      logger.info(`Posição definida via Pick Location: X=${x}, Y=${y}`);
      sendToRenderer("pick-location-result", { x, y });
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  pickProcess.on("error", (err) => {
    pickProcess = null;
    globalShortcut.unregister("Escape");
    buildTrayMenu(false);
    logger.error(`Pick Location PS error: ${err.message}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  return { success: true };
});

// These handlers are kept for backward compat but are no longer the primary path
ipcMain.handle("pick-location-done", (event, coords) => {
  return { success: true };
});

ipcMain.handle("cancel-pick-location", () => {
  cancelPickLocation();
  return { success: true };
});

app.on("window-all-closed", (e) => {
  e.preventDefault();
});

app.on("before-quit", () => {
  if (wsServer) wsServer.close();
});
