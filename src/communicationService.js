const { WebSocketServer } = require('ws');

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

module.exports = { createWebSocketServer };
