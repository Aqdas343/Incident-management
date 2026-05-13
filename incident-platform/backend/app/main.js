import express from 'express';
import http from 'http';
import cors from 'cors';
import fileUpload from 'express-fileupload';
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { authRouter } from './api/auth.js';
import { incidentRouter } from './api/incidents.js';
import { webhookRouter } from './api/webhooks.js';
import { dashboardRouter } from './api/dashboard.js';
import { initDb } from './database.js';
import { ensureSchema } from './schema_init.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { websocketManager } from './realtime/websocket_manager.js';
import { subscribeToEvents } from './services/notification_service.js';
import { initRedis } from './services/redis_client.js';
import { findUserByEmail, createUser } from './models/user.js';
import { checkStaleIncidents } from './services/stale_incident_service.js';
import bcrypt from 'bcrypt';
import { metricsRoute, captureRequestMetrics } from './monitoring.js';

process.on('unhandledRejection', (reason, promise) => {
  logger.error('process.unhandled_rejection', { reason: String(reason), promise: String(promise) });
});

process.on('uncaughtException', (err) => {
  logger.error('process.uncaught_exception', { error: err?.message, stack: err?.stack });
});

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  path: '/ws',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(captureRequestMetrics);

app.use('/auth', authRouter);
app.use('/incidents', incidentRouter);
app.use('/webhooks', webhookRouter);
app.use('/dashboard', dashboardRouter);

app.get('/', (_req, res) => res.json({ message: 'Incident Management Platform is running' }));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/metrics', metricsRoute);

app.use((err, _req, res, _next) => {
  logger.error('server.unhandled_error', { error: err?.message || 'unknown', stack: err?.stack });
  res.status(500).json({ error: 'Internal server error' });
});

async function ensureDefaultAdmin() {
  if (!config.defaultAdminEmail || !config.defaultAdminPassword) return;
  const existing = await findUserByEmail(config.defaultAdminEmail);
  if (!existing) {
    const hashedPassword = await bcrypt.hash(config.defaultAdminPassword, 10);
    await createUser({ email: config.defaultAdminEmail, role: 'super_admin', hashedPassword });
    logger.info('default_admin.created', { email: config.defaultAdminEmail });
  }
}

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication error'));
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: [config.jwtAlgorithm] });
    socket.user = payload;
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

await initRedis();
await subscribeToEvents((eventType, data) => {
  websocketManager.broadcast(eventType, data);
});

await ensureSchema();
await initDb();
await ensureDefaultAdmin();

await checkStaleIncidents();
setInterval(() => {
  checkStaleIncidents().catch((error) =>
    logger.error('stale.incident.scheduler_failed', { error: error.message }),
  );
}, 5 * 60 * 1000);

server.listen(config.port, () => {
  logger.info('server.started', { port: config.port });
});
