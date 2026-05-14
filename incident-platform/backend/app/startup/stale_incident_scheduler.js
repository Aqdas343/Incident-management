import { checkStaleIncidents } from '../services/stale_incident_service.js';
import { logger } from '../utils/logger.js';

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export async function startStaleIncidentScheduler() {
  
  await checkStaleIncidents();

  setInterval(() => {
    checkStaleIncidents().catch((error) => {
      logger.error('stale.incident.scheduler_failed', { error: error.message });
    });
  }, INTERVAL_MS);
}
