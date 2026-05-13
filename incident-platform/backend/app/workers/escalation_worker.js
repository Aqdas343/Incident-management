import { getIncidentById, updateEscalationLevel, createEscalationEvent, createParallelInvestigation, getEscalationRules, findOpenParallelInvestigation } from '../models/incident.js';
import { publishEvent } from '../services/notification_service.js';
import { queueEscalationTimeouts } from './queue.js';
import { logger } from '../utils/logger.js';

export async function checkEscalationRules(incidentId) {
  const incident = await getIncidentById(incidentId);
  if (!incident) {
    logger.error('escalation.worker.incident_not_found', { incidentId });
    return;
  }

  const rules = await getEscalationRules();
  let applied = false;

  for (const rule of rules) {
    if (!rule.active) continue;
    if (rule.severity && rule.severity !== incident.severity) continue;
    if (rule.category && rule.category !== incident.category) continue;
    if (incident.escalation_level >= rule.min_escalation_level && incident.escalation_level < rule.target_level) {
      if (rule.immediate && incident.status !== 'resolved') {
        await createEscalationEvent(incidentId, incident.escalation_level || 0, rule.target_level, `rule escalation to ${rule.target_level}`, incident.assigned_to || incident.id);
        await updateEscalationLevel(incidentId, rule.target_level);
        await publishEvent('incident.escalated', { incidentId, level: rule.target_level });
        applied = true;
      }
    }
  }

  if (!applied && incident.status !== 'resolved' && incident.severity === 'critical' && (incident.escalation_level || 0) < 1) {
    await createEscalationEvent(incidentId, incident.escalation_level || 0, 1, 'critical severity', incident.assigned_to || incident.id);
    await updateEscalationLevel(incidentId, 1);
    await publishEvent('incident.escalated', { incidentId, level: 1 });
  }

  await queueEscalationTimeouts(incidentId);

  if (incident.category === 'payment_failure' && ['high', 'critical'].includes(incident.severity)) {
    const existingInvestigation = await findOpenParallelInvestigation(incidentId, 'payment_failure_investigation');
    if (!existingInvestigation) {
      const investigation = await createParallelInvestigation(incidentId, {
        type: 'payment_failure_investigation',
        assignedTeam: 'finance-ops',
        deadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });
      await publishEvent('incident.parallel_investigation', { incidentId, investigation });
    }
  }
}

export async function escalateIfUnresolved(incidentId, targetLevel) {
  const incident = await getIncidentById(incidentId);
  if (!incident) return;
  if (incident.status !== 'resolved' && incident.escalation_level < targetLevel) {
    await createEscalationEvent(incidentId, incident.escalation_level || 0, targetLevel, `auto escalation to level ${targetLevel}`, incident.assigned_to || incident.id);
    await updateEscalationLevel(incidentId, targetLevel);
    await publishEvent('incident.escalated', { incidentId, level: targetLevel });
  }
}
