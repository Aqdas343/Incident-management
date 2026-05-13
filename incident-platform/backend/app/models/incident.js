import { supabase } from '../database.js';
import crypto from 'crypto';

export async function createIncident(data) {
  const id = crypto.randomUUID();
  const { data: incident, error } = await supabase.from('incidents').insert([
    {
      id,
      title: data.title,
      service: data.service,
      severity: data.severity || 'unknown',
      status: data.status || 'open',
      category: data.category || 'infrastructure',
      source: data.source,
      raw_payload: data.raw_payload || {},
      hash_fingerprint: data.hash_fingerprint,
      assigned_to: data.assigned_to || null,
      escalation_level: data.escalation_level || 0,
    },
  ]).select('*').single();

  if (error) throw error;
  return incident;
}

export async function findIncidentByFingerprint(hash) {
  const { data, error } = await supabase.from('incidents').select('*').eq('hash_fingerprint', hash).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function incrementDuplicateCount(id) {
  const { data, error } = await supabase.from('incidents').update({ updated_at: new Date().toISOString() }).eq('id', id).increment('duplicate_count', 1).select('*').single();
  if (error) throw error;
  return data;
}

export async function listIncidents(filters) {
  let query = supabase.from('incidents').select('*');
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.severity) query = query.eq('severity', filters.severity);
  if (filters.category) query = query.eq('category', filters.category);
  if (filters.assigned_to) query = query.eq('assigned_to', filters.assigned_to);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getIncidentById(id) {
  const { data, error } = await supabase.from('incidents').select('*').eq('id', id).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function assignIncident(id, assignedTo) {
  const { data, error } = await supabase.from('incidents').update({ assigned_to: assignedTo, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

export async function changeIncidentStatus(id, status) {
  const updates = {
    status,
    updated_at: new Date().toISOString(),
    resolved_at: status === 'resolved' ? new Date().toISOString() : null,
  };
  const { data, error } = await supabase.from('incidents').update(updates).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

export async function updateIncidentPriority(id, priority) {
  const { data, error } = await supabase.from('incidents').update({ severity: priority, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

export async function updateIncidentAiData(id, aiData) {
  const payload = {
    severity: aiData.severity,
    category: aiData.category,
    ai_summary: aiData.ai_summary,
    ai_root_cause: aiData.ai_root_cause,
    ai_suggested_action: aiData.ai_suggested_action,
    business_impact: aiData.business_impact,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('incidents').update(payload).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

export async function updateEscalationLevel(id, level) {
  const { data, error } = await supabase.from('incidents').update({ escalation_level: level, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

export async function addIncidentNote(incidentId, userId, content) {
  const incident = await getIncidentById(incidentId);
  if (!incident) return null;
  const id = crypto.randomUUID();
  const { data, error } = await supabase.from('incident_notes').insert([
    { id, incident_id: incidentId, user_id: userId, content },
  ]).select('*').single();
  if (error) throw error;
  return data;
}

export async function findOpenStaleIncidents(cutoffIso) {
  const { data, error } = await supabase.from('incidents').select('*').eq('status', 'open').lt('updated_at', cutoffIso);
  if (error) throw error;
  return data || [];
}

export async function createParallelInvestigation(incidentId, details) {
  const id = crypto.randomUUID();
  const { data, error } = await supabase.from('parallel_investigations').insert([
    {
      id,
      incident_id: incidentId,
      type: details.type,
      assigned_team: details.assignedTeam,
      deadline: details.deadline,
      status: 'open',
    },
  ]).select('*').single();

  if (error) throw error;
  return data;
}

export async function findOpenParallelInvestigation(incidentId, type) {
  const { data, error } = await supabase.from('parallel_investigations').select('*').eq('incident_id', incidentId).eq('type', type).eq('status', 'open').single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function mergeIncidentIntoParent(parentIncidentId, duplicateDetails) {
  const id = crypto.randomUUID();
  const duplicateHash = `${duplicateDetails.hash_fingerprint || crypto.randomUUID()}-${Date.now()}`;

  const { data, error } = await supabase.from('incidents').insert([
    {
      id,
      title: duplicateDetails.title,
      service: duplicateDetails.service,
      severity: duplicateDetails.severity || 'unknown',
      status: 'merged',
      category: duplicateDetails.category || 'infrastructure',
      source: duplicateDetails.source || 'webhook',
      raw_payload: duplicateDetails.raw_payload || {},
      hash_fingerprint: duplicateHash,
      assigned_to: duplicateDetails.assigned_to || null,
      escalation_level: duplicateDetails.escalation_level || 0,
      parent_incident_id: parentIncidentId,
    },
  ]).select('*').single();

  if (error) throw error;

  await incrementDuplicateCount(parentIncidentId);
  return data;
}

export async function escalateStaleIncident(incidentId) {
  const incident = await getIncidentById(incidentId);
  if (!incident || incident.status === 'resolved' || incident.escalation_level >= 3) return null;
  await createEscalationEvent(incidentId, incident.escalation_level || 0, 3, 'stale incident auto escalation', incident.assigned_to || incident.id);
  return updateEscalationLevel(incidentId, 3);
}

export async function createDeadLetterMessage({ queue, jobName, payload, error }) {
  const id = crypto.randomUUID();
  const { data, error: insertError } = await supabase.from('dead_letter_messages').insert([
    {
      id,
      queue,
      job_name: jobName,
      payload,
      error,
    },
  ]).select('*').single();
  if (insertError) throw insertError;
  return data;
}

export async function getEscalationRules() {
  const { data, error } = await supabase.from('escalation_rules').select('*').eq('active', true);
  if (error) throw error;
  return data || [];
}

export async function createEscalationEvent(incidentId, fromLevel, toLevel, reason, triggeredBy) {
  const id = crypto.randomUUID();
  const { data, error } = await supabase.from('escalation_events').insert([
    { id, incident_id: incidentId, from_level: fromLevel, to_level: toLevel, reason, triggered_by: triggeredBy },
  ]).select('*').single();
  if (error) throw error;
  return data;
}

export async function getIncidentTimeline(incidentId) {
  const { data: notes, error: notesError } = await supabase.from('incident_notes').select('*').eq('incident_id', incidentId);
  if (notesError) throw notesError;
  const { data: events, error: eventsError } = await supabase.from('escalation_events').select('*').eq('incident_id', incidentId);
  if (eventsError) throw eventsError;
  return [...(notes || []), ...(events || [])].sort((a, b) => new Date(a.created_at || a.triggered_at) - new Date(b.created_at || b.triggered_at));
}
