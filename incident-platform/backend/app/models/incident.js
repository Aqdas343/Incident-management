import crypto from 'crypto';
import { supabase } from '../database.js';

const now = () => new Date().toISOString();


export async function createIncident(data) {
  const { data: incident, error } = await supabase
    .from('incidents')
    .insert([{
      id:               crypto.randomUUID(),
      title:            data.title,
      service:          data.service,
      severity:         data.severity         || 'unknown',
      status:           data.status           || 'open',
      category:         data.category         || 'infrastructure',
      source:           data.source,
      raw_payload:      data.raw_payload       || {},
      hash_fingerprint: data.hash_fingerprint,
      assigned_to:      data.assigned_to       || null,
      escalation_level: data.escalation_level  || 0,
    }])
    .select('*')
    .single();
  if (error) throw error;
  return incident;
}

export async function findIncidentByFingerprint(hash) {
  const { data, error } = await supabase
    .from('incidents')
    .select('*')
    .eq('hash_fingerprint', hash)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function getIncidentById(id) {
  const { data, error } = await supabase.from('incidents').select('*').eq('id', id).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function listIncidents(filters = {}) {
  let query = supabase.from('incidents').select('*');
  if (filters.status)      query = query.eq('status',      filters.status);
  if (filters.severity)    query = query.eq('severity',    filters.severity);
  if (filters.category)    query = query.eq('category',    filters.category);
  if (filters.assigned_to) query = query.eq('assigned_to', filters.assigned_to);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function assignIncident(id, assignedTo) {
  const { data, error } = await supabase
    .from('incidents')
    .update({ assigned_to: assignedTo, updated_at: now() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function changeIncidentStatus(id, status) {
  const { data, error } = await supabase
    .from('incidents')
    .update({
      status,
      updated_at:  now(),
      resolved_at: status === 'resolved' ? now() : null,
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateIncidentPriority(id, priority) {
  const { data, error } = await supabase
    .from('incidents')
    .update({ severity: priority, updated_at: now() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateIncidentAiData(id, aiData) {
  const { data, error } = await supabase
    .from('incidents')
    .update({
      severity:            aiData.severity,
      category:            aiData.category,
      ai_summary:          aiData.ai_summary,
      ai_root_cause:       aiData.ai_root_cause,
      ai_suggested_action: aiData.ai_suggested_action,
      business_impact:     aiData.business_impact,
      updated_at:          now(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateEscalationLevel(id, level) {
  const { data, error } = await supabase
    .from('incidents')
    .update({ escalation_level: level, updated_at: now() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function incrementDuplicateCount(id) {
  // Supabase JS v2 has no .increment() — fetch current value then update
  const { data: current, error: fetchError } = await supabase
    .from('incidents')
    .select('duplicate_count')
    .eq('id', id)
    .single();
  if (fetchError) throw fetchError;

  const { data, error } = await supabase
    .from('incidents')
    .update({ duplicate_count: (current.duplicate_count || 0) + 1, updated_at: now() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function mergeIncidentIntoParent(parentIncidentId, duplicateDetails) {
  
  const duplicateHash = `${duplicateDetails.hash_fingerprint || crypto.randomUUID()}-${Date.now()}`;

  const { data, error } = await supabase
    .from('incidents')
    .insert([{
      id:                 crypto.randomUUID(),
      title:              duplicateDetails.title,
      service:            duplicateDetails.service,
      severity:           duplicateDetails.severity  || 'unknown',
      status:             'merged',
      category:           duplicateDetails.category  || 'infrastructure',
      source:             duplicateDetails.source    || 'webhook',
      raw_payload:        duplicateDetails.raw_payload || {},
      hash_fingerprint:   duplicateHash,
      assigned_to:        duplicateDetails.assigned_to    || null,
      escalation_level:   duplicateDetails.escalation_level || 0,
      parent_incident_id: parentIncidentId,
    }])
    .select('*')
    .single();
  if (error) throw error;

  await incrementDuplicateCount(parentIncidentId);
  return data;
}

export async function findOpenStaleIncidents(cutoffIso) {
  const { data, error } = await supabase
    .from('incidents')
    .select('*')
    .eq('status', 'open')
    .lt('updated_at', cutoffIso);
  if (error) throw error;
  return data || [];
}

export async function escalateStaleIncident(incidentId) {
  const incident = await getIncidentById(incidentId);
  if (!incident || incident.status === 'resolved' || incident.escalation_level >= 3) return null;

  const nextLevel = Math.min((incident.escalation_level || 0) + 1, 3);
  await createEscalationEvent(
    incidentId,
    incident.escalation_level || 0,
    nextLevel,
    'stale incident auto escalation',
    incident.assigned_to || incident.id,
  );
  return updateEscalationLevel(incidentId, nextLevel);
}


export async function addIncidentNote(incidentId, userId, content) {
  const incident = await getIncidentById(incidentId);
  if (!incident) return null;

  const { data, error } = await supabase
    .from('incident_notes')
    .insert([{ id: crypto.randomUUID(), incident_id: incidentId, user_id: userId, content }])
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function getEscalationRules() {
  const { data, error } = await supabase.from('escalation_rules').select('*').eq('active', true);
  if (error) throw error;
  return data || [];
}

export async function createEscalationEvent(incidentId, fromLevel, toLevel, reason, triggeredBy) {
  const { data, error } = await supabase
    .from('escalation_events')
    .insert([{
      id:           crypto.randomUUID(),
      incident_id:  incidentId,
      from_level:   fromLevel,
      to_level:     toLevel,
      reason,
      triggered_by: triggeredBy,
    }])
    .select('*')
    .single();
  if (error) throw error;
  return data;
}


export async function createParallelInvestigation(incidentId, details) {
  const { data, error } = await supabase
    .from('parallel_investigations')
    .insert([{
      id:            crypto.randomUUID(),
      incident_id:   incidentId,
      type:          details.type,
      assigned_team: details.assignedTeam,
      deadline:      details.deadline,
      status:        'open',
    }])
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function findOpenParallelInvestigation(incidentId, type) {
  const { data, error } = await supabase
    .from('parallel_investigations')
    .select('*')
    .eq('incident_id', incidentId)
    .eq('type', type)
    .eq('status', 'open')
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}


export async function createDeadLetterMessage({ queue, jobName, payload, error }) {
  const { data, error: insertError } = await supabase
    .from('dead_letter_messages')
    .insert([{ id: crypto.randomUUID(), queue, job_name: jobName, payload, error }])
    .select('*')
    .single();
  if (insertError) throw insertError;
  return data;
}


export async function getIncidentTimeline(incidentId) {
  const [{ data: notes, error: notesError }, { data: events, error: eventsError }] =
    await Promise.all([
      supabase.from('incident_notes').select('*').eq('incident_id', incidentId),
      supabase.from('escalation_events').select('*').eq('incident_id', incidentId),
    ]);

  if (notesError)  throw notesError;
  if (eventsError) throw eventsError;

  return [...(notes || []), ...(events || [])].sort(
    (a, b) =>
      new Date(a.created_at || a.triggered_at).getTime() -
      new Date(b.created_at || b.triggered_at).getTime(),
  );
}
