import express from 'express';
import { z } from 'zod';
import { authMiddleware, requireIncidentManager, requireSupportEngineerOrAbove } from './auth.js';
import { logger } from '../utils/logger.js';
import {
  listIncidents,
  getIncidentById,
  assignIncident,
  changeIncidentStatus,
  updateIncidentPriority,
  addIncidentNote,
  createEscalationEvent,
  getIncidentTimeline,
} from '../models/incident.js';

export const incidentRouter = express.Router();

incidentRouter.use(authMiddleware);

// Wraps async route handlers so unhandled rejections reach the Express error handler
const asyncHandler = (fn) => (req, res, next) => fn(req, res, next).catch(next);


incidentRouter.get('/', asyncHandler(async (req, res) => {
  const filters = {
    status:      req.query.status?.toString(),
    severity:    req.query.severity?.toString(),
    category:    req.query.category?.toString(),
    assigned_to: req.query.assigned_to?.toString(),
  };
  res.json(await listIncidents(filters));
}));

incidentRouter.get('/:id', asyncHandler(async (req, res) => {
  const incident = await getIncidentById(req.params.id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  res.json(incident);
}));

incidentRouter.put('/:id/assign', requireIncidentManager, asyncHandler(async (req, res) => {
  const result = z.object({ assigned_to: z.string().uuid() }).safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid payload', details: result.error.format() });
  }
  const incident = await assignIncident(req.params.id, result.data.assigned_to);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  res.json(incident);
}));

incidentRouter.put('/:id/status', requireSupportEngineerOrAbove, asyncHandler(async (req, res) => {
  const result = z.object({ status: z.enum(['open', 'investigating', 'resolved']) }).safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid payload', details: result.error.format() });
  }
  const incident = await changeIncidentStatus(req.params.id, result.data.status);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  res.json(incident);
}));

incidentRouter.put('/:id/priority', requireIncidentManager, asyncHandler(async (req, res) => {
  const result = z.object({ priority: z.string().min(1) }).safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid payload', details: result.error.format() });
  }
  const current = await getIncidentById(req.params.id);
  if (!current) return res.status(404).json({ error: 'Incident not found' });
  if ((current.escalation_level || 0) > 0) {
    return res.status(403).json({ error: 'Priority locked - incident escalated' });
  }
  res.json(await updateIncidentPriority(req.params.id, result.data.priority));
}));

incidentRouter.post('/:id/notes', requireSupportEngineerOrAbove, asyncHandler(async (req, res) => {
  const result = z.object({ content: z.string().min(1) }).safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid payload', details: result.error.format() });
  }
  const note = await addIncidentNote(req.params.id, req.user.sub, result.data.content);
  if (!note) return res.status(404).json({ error: 'Incident not found' });
  res.status(201).json(note);
}));

incidentRouter.post('/:id/escalate', requireIncidentManager, asyncHandler(async (req, res) => {
  const incident = await getIncidentById(req.params.id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  const fromLevel = incident.escalation_level || 0;
  const toLevel   = Math.min(fromLevel + 1, 3);
  const event     = await createEscalationEvent(req.params.id, fromLevel, toLevel, 'manual escalation', req.user.sub);

  logger.info('incident.manual_escalate', { incidentId: req.params.id, fromLevel, toLevel });
  res.json(event);
}));


incidentRouter.get('/:id/timeline', asyncHandler(async (req, res) => {
  res.json(await getIncidentTimeline(req.params.id));
}));
