const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { createWebSocketServer } = require('./src/communicationService');
const { createQueue } = require('./src/queueService');
const { executeAutomation } = require('./src/automationService');
const logger = require('./src/logger');

let mainWindow = null;
let tray = null;
let wsServer = null;
let queue = null;
let isRunning = true;
let overlayWindow = null;

// Load config
function loadConfig() {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  const defaultConfigPath = path.join(__dirname, 'config.json');

  if (!fs.existsSync(configPath)) {
    fs.copyFileSync(defaultConfigPath, configPath);
  }

  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return JSON.parse(fs.readFileSync(defaultConfigPath, 'utf8'));
  }
}

function saveConfig(config) {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
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
    title: 'Automation Client',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow.hide();
  });
}

function createTray() {
  // Use a simple default icon
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Abrir', click: () => mainWindow && mainWindow.show() },
    { type: 'separator' },
    { label: 'Sair', click: () => { mainWindow.destroy(); app.quit(); } },
  ]);

  tray.setToolTip('Automation Client');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow && mainWindow.show());
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  const config = loadConfig();

  // Create queue processor
  queue = createQueue(async (item) => {
    if (!isRunning) return;

    sendToRenderer('status-update', {
      status: 'processing',
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
      sendToRenderer('log-entry', {
        time: new Date().toISOString(),
        code: item.codigo,
        status: 'success',
        message: 'Automação executada com sucesso',
      });
    } catch (err) {
      logger.error(`Erro ao executar código ${item.codigo}: ${err.message}`);
      sendToRenderer('log-entry', {
        time: new Date().toISOString(),
        code: item.codigo,
        status: 'error',
        message: err.message,
      });
      sendToRenderer('status-update', {
        status: 'error',
        currentCode: null,
        queueSize: queue.size(),
      });
    }

    sendToRenderer('status-update', {
      status: queue.size() > 0 ? 'processing' : 'idle',
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

      sendToRenderer('status-update', {
        status: 'queued',
        currentCode: null,
        queueSize: queue.size(),
      });
    },
    onConnect: () => {
      sendToRenderer('connection-update', { connected: true });
    },
    onDisconnect: () => {
      sendToRenderer('connection-update', { connected: false });
    },
  });

  sendToRenderer('status-update', { status: 'idle', currentCode: null, queueSize: 0 });
});

// IPC Handlers
ipcMain.handle('get-config', () => loadConfig());

ipcMain.handle('save-config', (event, config) => {
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
          sendToRenderer('status-update', {
            status: 'queued',
            currentCode: null,
            queueSize: queue.size(),
          });
        },
        onConnect: () => sendToRenderer('connection-update', { connected: true }),
        onDisconnect: () => sendToRenderer('connection-update', { connected: false }),
      });
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('send-test-code', (event, codigo) => {
  if (!isRunning) return { success: false, error: 'Sistema pausado' };
  if (!codigo || !codigo.trim()) return { success: false, error: 'Código vazio' };

  logger.info(`Código de teste enviado manualmente: ${codigo}`);
  queue.add({ codigo: codigo.trim() });

  sendToRenderer('status-update', {
    status: 'queued',
    currentCode: null,
    queueSize: queue.size(),
  });

  return { success: true };
});

ipcMain.handle('toggle-running', () => {
  isRunning = !isRunning;
  sendToRenderer('running-update', { running: isRunning });
  logger.info(`Sistema ${isRunning ? 'retomado' : 'pausado'}`);
  return { running: isRunning };
});

ipcMain.handle('clear-queue', () => {
  queue.clear();
  sendToRenderer('status-update', { status: 'idle', currentCode: null, queueSize: 0 });
  return { success: true };
});

ipcMain.handle('get-logs', () => {
  try {
    const logPath = path.join(app.getPath('userData'), 'logs', 'automation.log');
    if (!fs.existsSync(logPath)) return [];
    const content = fs.readFileSync(logPath, 'utf8');
    return content
      .trim()
      .split('\n')
      .filter(Boolean)
      .slice(-100)
      .map((line) => {
        try { return JSON.parse(line); } catch { return { message: line }; }
      });
  } catch {
    return [];
  }
});

ipcMain.handle('get-ws-port', () => {
  const config = loadConfig();
  return config.wsPort || 9099;
});

// ── Pick Location ─────────────────────────────────────────────────────────────

ipcMain.handle('get-cursor-position', () => {
  return screen.getCursorScreenPoint();
});

ipcMain.handle('start-pick-location', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.focus();
    return { success: true };
  }

  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;

  if (mainWindow) mainWindow.hide();

  overlayWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'overlay-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');

  overlayWindow.once('ready-to-show', () => {
    overlayWindow.show();
    overlayWindow.focus();
    overlayWindow.setIgnoreMouseEvents(false);
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  return { success: true };
});

ipcMain.handle('pick-location-done', (event, coords) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy();
    overlayWindow = null;
  }

  if (coords && typeof coords.x === 'number' && typeof coords.y === 'number') {
    const config = loadConfig();
    config.mouseX = Math.round(coords.x);
    config.mouseY = Math.round(coords.y);
    saveConfig(config);
    logger.info(`Posição definida via Pick Location: X=${config.mouseX}, Y=${config.mouseY}`);
    sendToRenderer('pick-location-result', { x: config.mouseX, y: config.mouseY });
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }

  return { success: true };
});

ipcMain.handle('cancel-pick-location', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy();
    overlayWindow = null;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
  return { success: true };
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.on('before-quit', () => {
  if (wsServer) wsServer.close();
});
