import { getIncidentById, updateIncidentAiData } from '../models/incident.js';
import { classifyIncident } from '../services/ai_service.js';
import { publishEvent } from '../services/notification_service.js';
import { queueEscalationTimeouts } from './queue.js';
import { logger } from '../utils/logger.js';

export async function processIncidentAi(incidentId) {
  try {
    const incident = await getIncidentById(incidentId);
    if (!incident) {
      logger.error('ai.worker.incident_not_found', { incidentId });
      return;
    }
    const classification = await classifyIncident({
      service: incident.service,
      message: incident.title,
      timestamp: incident.raw_payload?.timestamp || incident.created_at,
    });
    const updated = await updateIncidentAiData(incidentId, classification);
    await publishEvent('incident.classified', { incidentId, classification, incident: updated });
    await queueEscalationTimeouts(incidentId);
    return classification;
  } catch (error) {
    logger.error('ai.worker.failed', { incidentId, error: error.message });
    throw error;
  }
}
