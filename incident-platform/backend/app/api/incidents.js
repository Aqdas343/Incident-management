import express from 'express';
import { authMiddleware, requireIncidentManager, requireSupportEngineerOrAbove } from './auth.js';
import { z } from 'zod';
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
import { logger } from '../utils/logger.js';

export const incidentRouter = express.Router();

incidentRouter.use(authMiddleware);

incidentRouter.get('/', async (req, res) => {
  const filters = {
    status: req.query.status?.toString(),
    severity: req.query.severity?.toString(),
    category: req.query.category?.toString(),
    assigned_to: req.query.assigned_to?.toString(),
  };
  const incidents = await listIncidents(filters);
  res.json(incidents);
});

incidentRouter.get('/:id', async (req, res) => {
  const incident = await getIncidentById(req.params.id);
  if (!incident) {
    return res.status(404).json({ error: 'Incident not found' });
  }
  res.json(incident);
});

incidentRouter.put('/:id/assign', requireIncidentManager, async (req, res) => {
  const schema = z.object({ assigned_to: z.string().uuid() });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid payload', details: result.error.format() });
  }
  const incident = await assignIncident(req.params.id, result.data.assigned_to);
  if (!incident) {
    return res.status(404).json({ error: 'Incident not found' });
  }
  res.json(incident);
});

incidentRouter.put('/:id/status', requireSupportEngineerOrAbove, async (req, res) => {
  const schema = z.object({ status: z.enum(['open', 'investigating', 'resolved']) });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid payload', details: result.error.format() });
  }
  const incident = await changeIncidentStatus(req.params.id, result.data.status);
  if (!incident) {
    return res.status(404).json({ error: 'Incident not found' });
  }
  res.json(incident);
});

incidentRouter.put('/:id/priority', requireIncidentManager, async (req, res) => {
  const schema = z.object({ priority: z.string().min(1) });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid payload', details: result.error.format() });
  }
  const currentIncident = await getIncidentById(req.params.id);
  if (!currentIncident) {
    return res.status(404).json({ error: 'Incident not found' });
  }
  if ((currentIncident.escalation_level || 0) > 0) {
    return res.status(403).json({ error: 'Priority locked - incident escalated' });
  }
  const incident = await updateIncidentPriority(req.params.id, result.data.priority);
  res.json(incident);
});

incidentRouter.post('/:id/notes', requireSupportEngineerOrAbove, async (req, res) => {
  const schema = z.object({ content: z.string().min(1) });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid payload', details: result.error.format() });
  }
  const note = await addIncidentNote(req.params.id, req.user.sub, result.data.content);
  if (!note) {
    return res.status(404).json({ error: 'Incident not found' });
  }
  res.status(201).json(note);
});

incidentRouter.post('/:id/escalate', requireIncidentManager, async (req, res) => {
  const incident = await getIncidentById(req.params.id);
  if (!incident) {
    return res.status(404).json({ error: 'Incident not found' });
  }
  const fromLevel = incident.escalation_level || 0;
  const toLevel = Math.min(fromLevel + 1, 3);
  const event = await createEscalationEvent(req.params.id, fromLevel, toLevel, 'manual escalation', req.user.sub);
  logger.info('incident.manual_escalate', { incidentId: req.params.id, fromLevel, toLevel });
  res.json(event);
});

incidentRouter.get('/:id/timeline', async (req, res) => {
  const timeline = await getIncidentTimeline(req.params.id);
  res.json(timeline);
});
