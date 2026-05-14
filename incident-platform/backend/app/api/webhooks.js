import express from 'express';
import { z } from 'zod';
import { authMiddleware } from './auth.js';
import { logger } from '../utils/logger.js';
import { webhookRateLimiter } from '../services/rate_limiter.js';
import { generateFingerprint } from '../services/deduplication_service.js';
import { sendIncidentAlert } from '../services/alert_service.js';
import { publishEvent } from '../services/notification_service.js';
import { recordWebhookReceived, recordDuplicateIncident, recordIncidentCreated } from '../monitoring.js';
import { queueIncidentForClassification, queueDeadLetterMessage } from '../workers/queue.js';
import {
  findIncidentByFingerprint,
  incrementDuplicateCount,
  createIncident,
  mergeIncidentIntoParent,
} from '../models/incident.js';

export const webhookRouter = express.Router();

const ingestSchema = z.object({
  service:     z.string().min(1),
  message:     z.string().min(1),
  timestamp:   z.string().min(1),
  source:      z.enum(['webhook', 'api', 'log', 'agent']).optional().default('webhook'),
  raw_payload: z.any().optional(),
});


async function handleDuplicate(existing, overrideData) {
  const updated = await incrementDuplicateCount(existing.id);
  recordDuplicateIncident();
  if ((updated.duplicate_count || 0) >= 3) {
    await mergeIncidentIntoParent(existing.id, overrideData);
  }
  return existing.id;
}

async function createAndDispatch(incidentData) {
  const incident = await createIncident(incidentData);
  recordIncidentCreated();
  await Promise.all([
    publishEvent('incident.created', incident),
    queueIncidentForClassification(incident.id),
    sendIncidentAlert(incident),
  ]);
  return incident;
}


webhookRouter.post('/ingest', webhookRateLimiter, authMiddleware, async (req, res) => {
  const result = ingestSchema.safeParse(req.body);
  if (!result.success) {
    logger.warn('webhook.invalid_payload', { error: result.error.format() });
    await queueDeadLetterMessage({
      queue:   'webhook_ingest',
      jobName: 'malformed_payload',
      payload: req.body,
      error:   JSON.stringify(result.error.format()),
    });
    return res.status(400).json({ error: 'Invalid payload', details: result.error.format() });
  }

  const data = result.data;
  recordWebhookReceived();

  const fingerprint = generateFingerprint(data.service, data.message);
  const existing    = await findIncidentByFingerprint(fingerprint);

  if (existing) {
    await handleDuplicate(existing, {
      title:           data.message,
      service:         data.service,
      source:          data.source,
      raw_payload:     data.raw_payload || data,
      hash_fingerprint: fingerprint,
    });
    return res.status(200).json({ message: 'Duplicate incident detected', incident_id: existing.id });
  }

  const incident = await createAndDispatch({
    title:           data.message,
    service:         data.service,
    source:          data.source,
    raw_payload:     data.raw_payload || data,
    hash_fingerprint: fingerprint,
    status:          'open',
  });

  logger.info('webhook.ingest', { incidentId: incident.id });
  res.status(202).json({ incident_id: incident.id, status: 'queued' });
});

webhookRouter.post('/upload-log', webhookRateLimiter, authMiddleware, async (req, res) => {
  if (!req.files?.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const lines    = req.files.file.data.toString('utf8').split(/\r?\n/).filter(Boolean);
  const results  = [];

  for (const line of lines) {
    const [timestamp, service, ...rest] = line.split('|');
    const message = rest.join('|').trim();
    if (!timestamp || !service || !message) continue;

    const fingerprint = generateFingerprint(service, message);
    const existing    = await findIncidentByFingerprint(fingerprint);

    if (existing) {
      await handleDuplicate(existing, {
        title:           message,
        service,
        severity:        'unknown',
        category:        'infrastructure',
        source:          'log',
        raw_payload:     { timestamp, service, message },
        hash_fingerprint: fingerprint,
      });
      results.push({ incident_id: existing.id, duplicate: true });
      continue;
    }

    const incident = await createAndDispatch({
      title:           message,
      service,
      source:          'log',
      raw_payload:     { timestamp, service, message },
      hash_fingerprint: fingerprint,
      status:          'open',
    });
    results.push({ incident_id: incident.id, duplicate: false });
  }

  res.status(201).json({ imported: results.length, incidents: results });
});
