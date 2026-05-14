import {
  getIncidentById,
  updateEscalationLevel,
  createEscalationEvent,
  createParallelInvestigation,
  getEscalationRules,
  findOpenParallelInvestigation,
} from '../models/incident.js';
import { publishEvent } from '../services/notification_service.js';
import { queueEscalationTimeouts } from './queue.js';
import { logger } from '../utils/logger.js';


async function escalate(incidentId, currentLevel, targetLevel, reason, triggeredBy) {
  await createEscalationEvent(incidentId, currentLevel, targetLevel, reason, triggeredBy);
  await updateEscalationLevel(incidentId, targetLevel);
  await publishEvent('incident.escalated', { incidentId, level: targetLevel });
}

export async function checkEscalationRules(incidentId) {
  const incident = await getIncidentById(incidentId);
  if (!incident) {
    logger.error('escalation.worker.incident_not_found', { incidentId });
    return;
  }

  const rules   = await getEscalationRules();
  const trigger = incident.assigned_to || incident.id;
  let applied   = false;

  for (const rule of rules) {
    if (!rule.active) continue;
    if (rule.severity && rule.severity !== incident.severity) continue;
    if (rule.category && rule.category !== incident.category) continue;

    const withinRange =
      incident.escalation_level >= rule.min_escalation_level &&
      incident.escalation_level < rule.target_level;

    if (withinRange && rule.immediate && incident.status !== 'resolved') {
      await escalate(incidentId, incident.escalation_level || 0, rule.target_level, `rule escalation to ${rule.target_level}`, trigger);
      applied = true;
    }
  }

  if (!applied && incident.status !== 'resolved' && incident.severity === 'critical' && (incident.escalation_level || 0) < 1) {
    await escalate(incidentId, incident.escalation_level || 0, 1, 'critical severity', trigger);
  }

  await queueEscalationTimeouts(incidentId);

  if (incident.category === 'payment_failure' && ['high', 'critical'].includes(incident.severity)) {
    const existing = await findOpenParallelInvestigation(incidentId, 'payment_failure_investigation');
    if (!existing) {
      const investigation = await createParallelInvestigation(incidentId, {
        type:         'payment_failure_investigation',
        assignedTeam: 'finance-ops',
        deadline:     new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });
      await publishEvent('incident.parallel_investigation', { incidentId, investigation });
    }
  }
}

export async function escalateIfUnresolved(incidentId, targetLevel) {
  const incident = await getIncidentById(incidentId);
  if (!incident) return;

  if (incident.status !== 'resolved' && incident.escalation_level < targetLevel) {
    await escalate(
      incidentId,
      incident.escalation_level || 0,
      targetLevel,
      `auto escalation to level ${targetLevel}`,
      incident.assigned_to || incident.id,
    );
  }
}
