export class WebSocketManager {
  constructor() {
    this.activeConnections = new Map();
  }

  connect(userId, socket) {
    const connections = this.activeConnections.get(userId) || [];
    connections.push(socket);
    this.activeConnections.set(userId, connections);

    socket.on('disconnect', () => this.disconnect(userId, socket));
  }

  disconnect(userId, socket) {
    const connections = this.activeConnections.get(userId) || [];
    this.activeConnections.set(userId, connections.filter((s) => s !== socket));
  }

  _send(socket, eventType, data) {
    if (typeof socket.emit === 'function') {
      socket.emit(eventType, data);
      return;
    }

    if (typeof socket.send === 'function') {
      socket.send(JSON.stringify({ event: eventType, data }));
    }
  }

  broadcast(eventType, data) {
    for (const connections of this.activeConnections.values()) {
      for (const socket of connections) {
        this._send(socket, eventType, data);
      }
    }
  }

  sendToUser(userId, eventType, data) {
    const connections = this.activeConnections.get(userId) || [];
    for (const socket of connections) {
      this._send(socket, eventType, data);
    }
  }
}

export const websocketManager = new WebSocketManager();
