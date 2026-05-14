import express from 'express';
import { authMiddleware, requireSuperAdmin } from './auth.js';
import { supabase } from '../database.js';
import { logger } from '../utils/logger.js';
import { getQueueStatus } from '../workers/queue.js';
import { websocketManager } from '../realtime/websocket_manager.js';

export const dashboardRouter = express.Router();


dashboardRouter.get('/stats', authMiddleware, async (_req, res) => {
  const DAY_AGO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [total, open, critical, escalated, resolvedToday, resolved] = await Promise.all([
    supabase.from('incidents').select('id', { count: 'exact', head: true }),
    supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('severity', 'critical'),
    supabase.from('incidents').select('id', { count: 'exact', head: true }).gt('escalation_level', 0),
    supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('status', 'resolved').gte('created_at', DAY_AGO),
    supabase.from('incidents').select('created_at, resolved_at').eq('status', 'resolved'),
  ]);

  const rows = resolved.data || [];
  const avgResolutionMs =
    rows.reduce((sum, r) => sum + Math.max(0, new Date(r.resolved_at) - new Date(r.created_at)), 0) /
    Math.max(1, rows.length);

  res.json({
    total_incidents:     total.count         || 0,
    open_count:          open.count          || 0,
    critical_count:      critical.count      || 0,
    escalated_count:     escalated.count     || 0,
    resolved_today:      resolvedToday.count || 0,
    avg_resolution_time: Number((avgResolutionMs / 1000).toFixed(1)) || 0,
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

dashboardRouter.get('/worker-status', authMiddleware, requireSuperAdmin, async (_req, res) => {
  const queueStatus = await getQueueStatus();
  res.json({ status: 'ok', queueStatus });
});

dashboardRouter.get('/retry-queue', authMiddleware, requireSuperAdmin, async (_req, res) => {
  res.json({ retryQueues: await getQueueStatus() });
});

dashboardRouter.get('/active-users', authMiddleware, requireSuperAdmin, async (_req, res) => {
  try {
    const userIds = websocketManager.getActiveUserIds();
    const count   = websocketManager.getActiveUserCount();

    let users = [];
    if (userIds.length > 0) {
      const { data } = await supabase.from('users').select('id, email, role').in('id', userIds);
      users = data || [];
    }

    logger.info('dashboard.active_users', { count });
    res.json({ count, users });
  } catch (error) {
    logger.error('dashboard.active_users.failed', { error: error?.message });
    res.status(500).json({ error: 'Failed to fetch active users' });
  }
});
