export class WebSocketManager {
  /** @type {Map<string, Set<object>>} */
  #connections = new Map();

  connect(userId, socket) {
    if (!this.#connections.has(userId)) {
      this.#connections.set(userId, new Set());
    }
    this.#connections.get(userId).add(socket);
    socket.on('disconnect', () => this.disconnect(userId, socket));
  }

  disconnect(userId, socket) {
    const sockets = this.#connections.get(userId);
    if (!sockets) return;
    sockets.delete(socket);
    if (sockets.size === 0) this.#connections.delete(userId);
  }

  getActiveUserIds() {
    return [...this.#connections.keys()];
  }

  getActiveUserCount() {
    return this.#connections.size;
  }

  #send(socket, eventType, data) {
    if (typeof socket.emit === 'function') {
      socket.emit(eventType, data);
    } else if (typeof socket.send === 'function') {
      socket.send(JSON.stringify({ event: eventType, data }));
    }
  }

  broadcast(eventType, data) {
    for (const sockets of this.#connections.values()) {
      for (const socket of sockets) {
        this.#send(socket, eventType, data);
      }
    }
  }

  sendToUser(userId, eventType, data) {
    const sockets = this.#connections.get(userId);
    if (!sockets) return;
    for (const socket of sockets) {
      this.#send(socket, eventType, data);
    }
  }
}

export const websocketManager = new WebSocketManager();
