import express from 'express';
import { authMiddleware, requireSuperAdmin } from './auth.js';
import { supabase } from '../database.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import { getQueueStatus } from '../workers/queue.js';
import { isRedisAvailable } from '../services/redis_client.js';
import Redis from 'ioredis';

export const dashboardRouter = express.Router();

let heartbeatClient = null;

function getHeartbeatClient() {
  if (!isRedisAvailable()) return null;
  if (!heartbeatClient) {
    heartbeatClient = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
    });
    heartbeatClient.on('error', (error) => {
      logger.warn('dashboard.redis.error', { error: error?.message || String(error) });
    });
  }
  return heartbeatClient;
}

dashboardRouter.get('/stats', authMiddleware, async (_req, res) => {
  const [total, openCount, criticalCount, escalatedCount, resolvedToday, resolved] = await Promise.all([
    supabase.from('incidents').select('id', { count: 'exact', head: true }),
    supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('severity', 'critical'),
    supabase.from('incidents').select('id', { count: 'exact', head: true }).gt('escalation_level', 0),
    supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('status', 'resolved').gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    supabase.from('incidents').select('created_at, resolved_at').eq('status', 'resolved'),
  ]);

  const resolvedRows = resolved.data || [];
  const avgResolution =
    resolvedRows.reduce((sum, row) => {
      return sum + Math.max(0, new Date(row.resolved_at).getTime() - new Date(row.created_at).getTime());
    }, 0) /
    Math.max(1, resolvedRows.length) /
    1000;

  res.json({
    total_incidents: total.count || 0,
    open_count: openCount.count || 0,
    critical_count: criticalCount.count || 0,
    escalated_count: escalatedCount.count || 0,
    resolved_today: resolvedToday.count || 0,
    avg_resolution_time: Number(avgResolution.toFixed(1)) || 0,
  });
});

dashboardRouter.get('/escalation-rules', authMiddleware, requireSuperAdmin, (_req, res) => {
  res.json({
    rules: [
      'critical -> escalation_level 1 immediately',
      'if unresolved 15m -> escalation_level 2',
      'if unresolved 30m -> escalation_level 3',
      'payment_failure + high/critical -> open parallel investigation',
    ],
  });
});

async function getWorkerHeartbeats() {
  const client = getHeartbeatClient();
  if (!client) return null;
  try {
    const [ai, escalation, deadletter] = await Promise.all([
      client.get('worker:ai:heartbeat'),
      client.get('worker:escalation:heartbeat'),
      client.get('worker:deadletter:heartbeat'),
    ]);
    return {
      ai: ai ? new Date(Number(ai)).toISOString() : null,
      escalation: escalation ? new Date(Number(escalation)).toISOString() : null,
      deadletter: deadletter ? new Date(Number(deadletter)).toISOString() : null,
    };
  } catch (error) {
    logger.warn('dashboard.worker_heartbeat_failed', { error: error?.message || String(error) });
    return null;
  }
}

dashboardRouter.get('/worker-status', authMiddleware, requireSuperAdmin, async (_req, res) => {
  logger.info('dashboard.worker_status');
  const [queueStatus, workerHeartbeats] = await Promise.all([getQueueStatus(), getWorkerHeartbeats()]);
  res.json({ status: 'ok', queueStatus, workerHeartbeats });
});

dashboardRouter.get('/retry-queue', authMiddleware, requireSuperAdmin, async (_req, res) => {
  const queueStatus = await getQueueStatus();
  res.json({ retryQueues: queueStatus });
});
