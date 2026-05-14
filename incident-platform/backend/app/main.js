import express from 'express';
import http from 'http';
import cors from 'cors';
import fileUpload from 'express-fileupload';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { initDb } from './database.js';
import { ensureSchema } from './schema_init.js';
import { initRedis } from './services/redis_client.js';
import { subscribeToEvents } from './services/notification_service.js';
import { websocketManager } from './realtime/websocket_manager.js';
import { captureRequestMetrics, metricsRoute } from './monitoring.js';
import { createSocketServer } from './startup/socket_setup.js';
import { ensureDefaultAdmin } from './startup/admin_seed.js';
import { startStaleIncidentScheduler } from './startup/stale_incident_scheduler.js';
import { authRouter } from './api/auth.js';
import { incidentRouter } from './api/incidents.js';
import { webhookRouter } from './api/webhooks.js';
import { dashboardRouter } from './api/dashboard.js';

process.on('unhandledRejection', (reason) => {
  logger.error('process.unhandled_rejection', { reason: String(reason) });
});

process.on('uncaughtException', (err) => {
  logger.error('process.uncaught_exception', { error: err?.message, stack: err?.stack });
});

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(captureRequestMetrics);

// Attach Socket.IO after CORS middleware so HTTP polling upgrade requests
// also receive the correct CORS headers from Express
createSocketServer(server);

app.use('/auth',      authRouter);
app.use('/incidents', incidentRouter);
app.use('/webhooks',  webhookRouter);
app.use('/dashboard', dashboardRouter);

app.get('/',       (_req, res) => res.json({ message: 'Incident Management Platform is running' }));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/metrics', metricsRoute);

app.use((err, _req, res, _next) => {
  logger.error('server.unhandled_error', { error: err?.message || 'unknown', stack: err?.stack });
  res.status(500).json({ error: 'Internal server error' });
});

await initRedis();
await subscribeToEvents((eventType, data) => websocketManager.broadcast(eventType, data));
await ensureSchema();
await initDb();
await ensureDefaultAdmin();
await startStaleIncidentScheduler();

server.listen(config.port, () => {
  logger.info('server.started', { port: config.port });
});
