import { findOpenStaleIncidents, escalateStaleIncident } from '../models/incident.js';
import { publishEvent } from './notification_service.js';
import { logger } from '../utils/logger.js';

export async function checkStaleIncidents() {
  try {
    const cutoffIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const staleIncidents = await findOpenStaleIncidents(cutoffIso);
    if (!staleIncidents.length) return;

    for (const incident of staleIncidents) {
      const updated = await escalateStaleIncident(incident.id);
      if (updated) {
        logger.warn('stale.incident.escalated', { incidentId: incident.id });
        await publishEvent('incident.escalated', { incidentId: incident.id, reason: 'stale incident auto escalation' });
      }
    }
  } catch (error) {
    logger.error('stale.incident.check_failed', { error: error.message });
  }
}
