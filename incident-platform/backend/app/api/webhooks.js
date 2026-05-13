import express from 'express';
import { z } from 'zod';
import { authMiddleware } from './auth.js';
import { findIncidentByFingerprint, incrementDuplicateCount, createIncident, mergeIncidentIntoParent } from '../models/incident.js';
import { generateFingerprint } from '../services/deduplication_service.js';
import { logger } from '../utils/logger.js';
import { queueIncidentForClassification, queueDeadLetterMessage } from '../workers/queue.js';
import { webhookRateLimiter } from '../services/rate_limiter.js';
import { recordWebhookReceived, recordDuplicateIncident, recordIncidentCreated } from '../monitoring.js';
import { sendIncidentAlert } from '../services/alert_service.js';
import { publishEvent } from '../services/notification_service.js';

const schema = z.object({
  service: z.string().min(1),
  message: z.string().min(1),
  timestamp: z.string().min(1),
  source: z.enum(['webhook', 'api', 'log', 'agent']).optional().default('webhook'),
  raw_payload: z.any().optional(),
});

export const webhookRouter = express.Router();

webhookRouter.post('/ingest', webhookRateLimiter, authMiddleware, async (req, res) => {
  const parseResult = schema.safeParse(req.body);
  if (!parseResult.success) {
    logger.warn('webhook.invalid_payload', { error: parseResult.error.format() });
    await queueDeadLetterMessage({
      queue: 'webhook_ingest',
      jobName: 'malformed_payload',
      payload: req.body,
      error: JSON.stringify(parseResult.error.format()),
    });
    return res.status(400).json({ error: 'Invalid payload', details: parseResult.error.format() });
  }

  const data = parseResult.data;
  recordWebhookReceived();

  const fingerprint = generateFingerprint(data.service, data.message);
  const existing = await findIncidentByFingerprint(fingerprint);
  if (existing) {
    const updatedExisting = await incrementDuplicateCount(existing.id);
    recordDuplicateIncident();
    if ((updatedExisting.duplicate_count || 0) >= 3) {
      await mergeIncidentIntoParent(existing.id, {
        title: data.message,
        service: data.service,
        severity: data.severity,
        category: data.category,
        source: data.source,
        raw_payload: data.raw_payload || data,
        hash_fingerprint: fingerprint,
      });
    }
    return res.status(200).json({ message: 'Duplicate incident detected', incident_id: existing.id });
  }

  const incident = await createIncident({
    title: data.message,
    service: data.service,
    source: data.source,
    raw_payload: data.raw_payload || data,
    hash_fingerprint: fingerprint,
    status: 'open',
  });

  recordIncidentCreated();
  await publishEvent('incident.created', incident);
  await queueIncidentForClassification(incident.id);
  await sendIncidentAlert(incident);

  logger.info('webhook.ingest', { incidentId: incident.id });
  res.status(202).json({ incident_id: incident.id, status: 'queued' });
});

webhookRouter.post('/upload-log', webhookRateLimiter, authMiddleware, async (req, res) => {
  if (!req.files?.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const fileBuffer = req.files.file.data;
  const logText = fileBuffer.toString('utf8');
  const lines = logText.split(/\r?\n/).filter(Boolean);
  const incidents = [];

  for (const line of lines) {
    const [timestamp, service, ...messageParts] = line.split('|');
    const message = messageParts.join('|').trim();
    if (!timestamp || !service || !message) continue;

    const fingerprint = generateFingerprint(service, message);
    const existing = await findIncidentByFingerprint(fingerprint);
    if (existing) {
      const updatedExisting = await incrementDuplicateCount(existing.id);
      recordDuplicateIncident();
      if ((updatedExisting.duplicate_count || 0) >= 3) {
        await mergeIncidentIntoParent(existing.id, {
          title: message,
          service,
          severity: 'unknown',
          category: 'infrastructure',
          source: 'log',
          raw_payload: { timestamp, service, message },
          hash_fingerprint: fingerprint,
        });
      }
      incidents.push({ incident_id: existing.id, duplicate: true });
      continue;
    }

    const incident = await createIncident({
      title: message,
      service,
      source: 'log',
      raw_payload: { timestamp, service, message },
      hash_fingerprint: fingerprint,
      status: 'open',
    });

    recordIncidentCreated();
    await publishEvent('incident.created', incident);
    await queueIncidentForClassification(incident.id);
    await sendIncidentAlert(incident);
    incidents.push({ incident_id: incident.id, duplicate: false });
  }

  res.status(201).json({ imported: incidents.length, incidents });
});
