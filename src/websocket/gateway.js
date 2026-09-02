import { WebSocketServer } from "ws";

export function createWebSocketGateway(server, { path = "/ws", authorize = () => true } = {}) {
  const wss = new WebSocketServer({ server, path });
  wss.on("connection", (socket, request) => {
    if (!authorize(request)) { socket.close(1008, "Unauthorized"); return; }
    socket.send(JSON.stringify({ type: "connected", data: { serverTime: new Date().toISOString() } }));
  });
  const broadcast = (event) => { const message = JSON.stringify(event); for (const client of wss.clients) if (client.readyState === 1) client.send(message); };
  return { wss, broadcast, close: () => wss.close() };
}
