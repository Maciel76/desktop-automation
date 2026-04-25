const api = window.electronAPI;

// --- State ---
let isRunning = true;
let configVisible = false;

// --- Elements ---
const connDot = document.getElementById("conn-dot");
const connLabel = document.getElementById("conn-label");
const statusIconWrap = document.getElementById("status-icon-wrap");
const statusIcon = document.getElementById("status-icon");
const statusLabel = document.getElementById("status-label");
const statusSub = document.getElementById("status-sub");
const queueCount = document.getElementById("queue-count");
const currentCodeRow = document.getElementById("current-code-row");
const currentCodeValue = document.getElementById("current-code-value");
const testInput = document.getElementById("test-input");
const btnSend = document.getElementById("btn-send");
const btnStop = document.getElementById("btn-stop");
const btnClear = document.getElementById("btn-clear");
const btnConfig = document.getElementById("btn-config");
const configPanel = document.getElementById("config-panel");
const btnSaveConfig = document.getElementById("btn-save-config");
const btnCancelConfig = document.getElementById("btn-cancel-config");
const logList = document.getElementById("log-list");
const btnClearLog = document.getElementById("btn-clear-log");
const wsPortDisplay = document.getElementById("ws-port-display");

// --- Config fields ---
const cfgPort = document.getElementById("cfg-port");
const cfgKey = document.getElementById("cfg-key");
const cfgX = document.getElementById("cfg-x");
const cfgY = document.getElementById("cfg-y");
const cfgClickDelay = document.getElementById("cfg-click-delay");
const cfgTypeDelay = document.getElementById("cfg-type-delay");
const cfgMinimize = document.getElementById("cfg-minimize");

// --- Pick Location elements ---
const btnPickLocation = document.getElementById("btn-pick-location");
const pickXDisplay = document.getElementById("pick-x-display");
const pickYDisplay = document.getElementById("pick-y-display");

// --- Status update ---
function applyStatus(data) {
  const { status, currentCode, queueSize } = data;

  queueCount.textContent = queueSize != null ? queueSize : 0;

  if (currentCode) {
    currentCodeRow.style.display = "flex";
    currentCodeValue.textContent = currentCode;
  } else {
    currentCodeRow.style.display = "none";
  }

  statusIconWrap.className = "status-icon-wrap";

  if (!isRunning) {
    statusIcon.textContent = "⛔";
    statusLabel.textContent = "Sistema pausado";
    statusSub.textContent = "Clique em Retomar para continuar";
    return;
  }

  switch (status) {
    case "processing":
      statusIconWrap.classList.add("processing");
      statusIcon.textContent = "⚡";
      statusLabel.textContent = "Processando";
      statusSub.textContent = `Código: ${currentCode || "..."}`;
      break;
    case "queued":
      statusIconWrap.classList.add("processing");
      statusIcon.textContent = "⏳";
      statusLabel.textContent = "Aguardando na fila";
      statusSub.textContent = `${queueSize} código(s) na fila`;
      break;
    case "error":
      statusIconWrap.classList.add("error");
      statusIcon.textContent = "❌";
      statusLabel.textContent = "Erro na execução";
      statusSub.textContent = "Veja o log para detalhes";
      break;
    default:
      statusIconWrap.classList.add("idle");
      statusIcon.textContent = "✅";
      statusLabel.textContent = "Aguardando código";
      statusSub.textContent = "Sistema pronto";
  }
}

// --- Connection update ---
function applyConnection(data) {
  if (data.connected) {
    connDot.className = "dot connected";
    connLabel.textContent = "Conectado";
  } else {
    connDot.className = "dot";
    connLabel.textContent = "Aguardando";
  }
}

// --- Log entry ---
const logEntries = [];
function addLogEntry(entry) {
  const isEmpty = logList.querySelector(".log-empty");
  if (isEmpty) isEmpty.remove();

  logEntries.unshift(entry);
  if (logEntries.length > 100) logEntries.pop();

  const el = document.createElement("div");
  el.className = "log-entry";

  const dot = document.createElement("span");
  dot.className = `log-dot ${entry.status}`;

  const code = document.createElement("span");
  code.className = "log-code";
  code.textContent = entry.code || "—";

  const msg = document.createElement("span");
  msg.className = "log-msg";
  msg.textContent = entry.message || "";

  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = entry.time
    ? new Date(entry.time).toLocaleTimeString("pt-br")
    : "";

  el.appendChild(dot);
  el.appendChild(code);
  el.appendChild(msg);
  el.appendChild(time);
  logList.prepend(el);

  // Keep max 50 DOM nodes
  while (logList.children.length > 50) {
    logList.removeChild(logList.lastChild);
  }
}

// --- Load config into form ---
async function loadConfigIntoForm() {
  const config = await api.getConfig();
  cfgPort.value = config.wsPort || 9099;
  cfgKey.value = config.keyAfterType || "F5";
  cfgX.value = config.mouseX || 500;
  cfgY.value = config.mouseY || 300;
  cfgClickDelay.value = config.clickDelay || 200;
  cfgTypeDelay.value = config.typeDelay || 200;
  cfgMinimize.checked = config.minimizeBeforeAction !== false;

  // Sync pick location display
  pickXDisplay.textContent = config.mouseX || 500;
  pickYDisplay.textContent = config.mouseY || 300;
}

// --- Event Listeners ---

btnSend.addEventListener("click", async () => {
  const codigo = testInput.value.trim();
  if (!codigo) return;
  const result = await api.sendTestCode(codigo);
  if (result.success) {
    testInput.value = "";
    testInput.focus();
  } else {
    statusLabel.textContent = result.error || "Erro ao enviar";
  }
});

testInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") btnSend.click();
});

btnStop.addEventListener("click", async () => {
  const result = await api.toggleRunning();
  isRunning = result.running;
  btnStop.textContent = isRunning ? "⛔ Parar" : "▶ Retomar";
  btnStop.className = isRunning ? "btn btn-danger" : "btn btn-primary";

  if (!isRunning) {
    applyStatus({ status: "paused", currentCode: null, queueSize: 0 });
  } else {
    applyStatus({ status: "idle", currentCode: null, queueSize: 0 });
  }
});

btnClear.addEventListener("click", () => {
  api.clearQueue();
});

// --- Pick Location ---
btnPickLocation.addEventListener("click", async () => {
  btnPickLocation.textContent = "🔴 Clique na tela...";
  btnPickLocation.disabled = true;
  btnPickLocation.classList.add("btn-picking");
  // The main window will hide itself. The user just needs to click anywhere.
  await api.startPickLocation();
});

btnConfig.addEventListener("click", async () => {
  configVisible = !configVisible;
  configPanel.style.display = configVisible ? "block" : "none";
  if (configVisible) await loadConfigIntoForm();
});

btnSaveConfig.addEventListener("click", async () => {
  const config = {
    wsPort: parseInt(cfgPort.value, 10) || 9099,
    keyAfterType: cfgKey.value || "F5",
    mouseX: parseInt(cfgX.value, 10) || 500,
    mouseY: parseInt(cfgY.value, 10) || 300,
    clickDelay: parseInt(cfgClickDelay.value, 10) || 200,
    typeDelay: parseInt(cfgTypeDelay.value, 10) || 200,
    minimizeBeforeAction: cfgMinimize.checked,
  };

  const result = await api.saveConfig(config);
  if (result.success) {
    configPanel.style.display = "none";
    configVisible = false;
    wsPortDisplay.textContent = config.wsPort;
    addLogEntry({
      time: new Date().toISOString(),
      code: "—",
      status: "success",
      message: "Configurações salvas",
    });
  }
});

btnCancelConfig.addEventListener("click", () => {
  configPanel.style.display = "none";
  configVisible = false;
});

btnClearLog.addEventListener("click", () => {
  logList.innerHTML = '<div class="log-empty">Nenhuma execução ainda</div>';
});

// --- IPC Listeners ---
api.onStatusUpdate(applyStatus);
api.onConnectionUpdate(applyConnection);
api.onLogEntry(addLogEntry);
api.onRunningUpdate((data) => {
  isRunning = data.running;
  btnStop.textContent = isRunning ? "⛔ Parar" : "▶ Retomar";
  btnStop.className = isRunning ? "btn btn-danger" : "btn btn-primary";
});

// Pick Location result
api.onPickLocationResult((coords) => {
  btnPickLocation.textContent = "🎯 Pick Location";
  btnPickLocation.disabled = false;
  btnPickLocation.classList.remove("btn-picking");

  if (coords) {
    pickXDisplay.textContent = coords.x;
    pickYDisplay.textContent = coords.y;
    cfgX.value = coords.x;
    cfgY.value = coords.y;

    // Flash the pick coords block to confirm
    const block = document.querySelector(".pick-coords");
    if (block) {
      block.classList.add("pick-confirmed");
      setTimeout(() => block.classList.remove("pick-confirmed"), 1500);
    }

    addLogEntry({
      time: new Date().toISOString(),
      code: "—",
      status: "success",
      message: `Posição definida: X=${coords.x}, Y=${coords.y}`,
    });
  }
});

api.onPickLocationCancelled(() => {
  btnPickLocation.textContent = "🎯 Pick Location";
  btnPickLocation.disabled = false;
  btnPickLocation.classList.remove("btn-picking");
});

// --- Init ---
(async () => {
  const port = await api.getWsPort();
  wsPortDisplay.textContent = port;

  // Sync manual X/Y inputs with display
  cfgX.addEventListener("input", () => {
    pickXDisplay.textContent = cfgX.value || "—";
  });
  cfgY.addEventListener("input", () => {
    pickYDisplay.textContent = cfgY.value || "—";
  });

  const logs = await api.getLogs();
  if (logs && logs.length > 0) {
    logs.slice(-20).forEach((l) => {
      addLogEntry({
        time: l.timestamp,
        code: "—",
        status: l.level === "error" ? "error" : "success",
        message: l.message,
      });
    });
  }
})();
