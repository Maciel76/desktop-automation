const { WebSocketServer, WebSocket } = require('ws');

/**
 * Creates a WebSocket server that listens for incoming codes.
 * Expected message format: { "codigo": "123456" }
 */
function createWebSocketServer(port, { onCode, onConnect, onDisconnect }) {
  const wss = new WebSocketServer({ port });

  wss.on('connection', (ws) => {
    onConnect && onConnect();

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg && msg.codigo) {
          onCode(String(msg.codigo).trim());
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      onDisconnect && onDisconnect();
    });

    ws.on('error', () => {
      onDisconnect && onDisconnect();
    });

    // Confirm connection
    ws.send(JSON.stringify({ type: 'connected', message: 'Automation Client pronto' }));
  });

  wss.on('error', (err) => {
    console.error('[WS] Erro no servidor:', err.message);
  });

  return wss;
}

/**
 * Connects outbound to the backend relay.
 * The relay URL must be: wss://yourserver.com/ws/relay
 * The deviceToken must match AUTOMATION_DEVICE_TOKEN in the backend .env.
 *
 * This is OPTIONAL — if relayUrl is empty the app still works locally via
 * the local WebSocket server above.
 *
 * @param {string} relayUrl  - e.g. "wss://api.myapp.com/ws/relay"
 * @param {string} deviceToken - token defined in config and backend .env
 * @param {{ onCode, onConnect, onDisconnect }} callbacks
 * @returns {{ close: Function }} - call close() to permanently disconnect
 */
function connectToRelay(relayUrl, deviceToken, { onCode, onConnect, onDisconnect }) {
  let ws = null;
  let stopped = false;
  let retryTimer = null;
  let retryDelay = 5000;

  function connect() {
    if (stopped) return;

    const url = `${relayUrl}?type=device&token=${encodeURIComponent(deviceToken)}`;
    ws = new WebSocket(url);

    ws.on('open', () => {
      console.log('[Relay] Conectado ao servidor relay');
      retryDelay = 5000; // reset backoff on successful connection
      onConnect && onConnect();
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg && msg.codigo) {
          onCode(String(msg.codigo).trim());
        }
      } catch {
        // ignore
      }
    });

    ws.on('close', () => {
      console.log('[Relay] Conexão encerrada. Reconectando em', retryDelay / 1000, 's...');
      onDisconnect && onDisconnect();
      if (!stopped) {
        retryTimer = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 2, 60000); // exponential backoff, max 60s
          connect();
        }, retryDelay);
      }
    });

    ws.on('error', (err) => {
      console.error('[Relay] Erro:', err.message);
      // close event will handle reconnect
    });
  }

  connect();

  return {
    close() {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (ws) ws.close();
    },
  };
}

module.exports = { createWebSocketServer, connectToRelay };

