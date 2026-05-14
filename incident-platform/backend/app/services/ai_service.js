import { config } from '../config.js';
import { logger } from '../utils/logger.js';

function buildPrompt(incident) {
  return [
    'You are an expert incident management AI. Analyze this incident and respond ONLY with valid JSON.',
    '',
    'Incident:',
    `Service:   ${incident.service}`,
    `Message:   ${incident.message}`,
    `Timestamp: ${incident.timestamp}`,
    '',
    'Respond with this exact JSON structure:',
    '{',
    '  "severity": "low|medium|high|critical",',
    '  "category": "infrastructure|database|security|payment_failure|authentication|network",',
    '  "business_impact": "brief description of business impact",',
    '  "ai_summary": "2-3 sentence summary of the incident",',
    '  "ai_root_cause": "most likely root cause",',
    '  "ai_suggested_action": "recommended immediate action",',
    '  "confidence_score": 0.0-1.0',
    '}',
  ].join('\n');
}

async function classifyWithGroq(incident) {
  const response = await fetch(`${config.groqApiUrl}/chat/completions`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  `Bearer ${config.groqApiKey}`,
    },
    body: JSON.stringify({
      model:      config.groqModel,
      messages: [
        { role: 'system', content: 'You are an incident classification AI. Always respond with valid JSON only, no other text.' },
        { role: 'user',   content: buildPrompt(incident) },
      ],
      temperature: 0,
      max_tokens:  1000,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Groq API error: ${response.status} ${response.statusText} — ${body}`);
  }

  const json = await response.json();
  return JSON.parse(json?.choices?.[0]?.message?.content || '');
}

export async function classifyIncident(incidentData) {
  if (!config.groqApiKey) {
    throw new Error('No AI API key configured. Set GROQ_API_KEY in environment variables.');
  }
  try {
    logger.info('ai.classifying', { provider: 'groq', model: config.groqModel });
    return await classifyWithGroq(incidentData);
  } catch (error) {
    logger.error('ai.classification.failed', { error: error.message, incidentData });
    throw error;
  }
}
