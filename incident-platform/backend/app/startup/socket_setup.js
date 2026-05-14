import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { websocketManager } from '../realtime/websocket_manager.js';

export function createSocketServer(httpServer) {
  const io = new SocketIOServer(httpServer, {
    path: '/ws',
    cors: {
      origin:      '*',
      methods:     ['GET', 'POST'],
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication error'));
    try {
      socket.user = jwt.verify(token, config.jwtSecret, { algorithms: [config.jwtAlgorithm] });
      return next();
    } catch {
      return next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.sub;
    websocketManager.connect(userId, socket);
    socket.on('disconnect', () => websocketManager.disconnect(userId, socket));
  });

  return io;
}
