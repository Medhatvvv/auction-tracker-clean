import { WebSocketServer } from 'ws';

let wss = null;

export function attachWebSocket(httpServer) {
  wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'hello' }));
    ws.on('error', () => {});
  });
  console.log('[ws] WebSocket server attached at /ws');
}

export function broadcast(payload) {
  if (!wss) return;
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data);
  }
}
