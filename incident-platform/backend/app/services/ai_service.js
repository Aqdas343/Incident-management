import { Anthropic } from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const anthropicClient = config.anthropicApiKey ? new Anthropic({ apiKey: config.anthropicApiKey }) : null;
const openaiClient = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null;

function buildPrompt(incidentData) {
  return `You are an expert incident management AI. Analyze this incident and respond ONLY with valid JSON.\n\nIncident:\nService: ${incidentData.service}\nMessage: ${incidentData.message}\nTimestamp: ${incidentData.timestamp}\n\nRespond with this exact JSON structure:\n{\n  "severity": "low|medium|high|critical",\n  "category": "infrastructure|database|security|payment_failure|authentication|network",\n  "business_impact": "brief description of business impact",\n  "ai_summary": "2-3 sentence summary of the incident",\n  "ai_root_cause": "most likely root cause",\n  "ai_suggested_action": "recommended immediate action",\n  "confidence_score": 0.0-1.0\n}\n`;
}

async function classifyWithOpenAI(incidentData) {
  const prompt = buildPrompt(incidentData);
  const response = await openaiClient.chat.completions.create({
    model: config.openaiModel,
    messages: [
      {
        role: 'system',
        content: 'You are an incident classification AI. Always respond with valid JSON only, no other text.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0,
    response_format: { type: 'json_object' },
  });

  const text = response?.choices?.[0]?.message?.content || '';
  return JSON.parse(text);
}

async function classifyWithAnthropic(incidentData) {
  const prompt = buildPrompt(incidentData);
  const message = await anthropicClient.messages.create({
    model: config.anthropicModel,
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = message?.content?.[0]?.text || message?.output?.[0]?.content?.[0]?.text || '';
  return JSON.parse(text);
}

async function classifyWithGroq(incidentData) {
  const prompt = buildPrompt(incidentData);
  const response = await fetch(`${config.groqApiUrl}/models/${config.groqModel}/outputs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.groqApiKey}`,
    },
    body: JSON.stringify({
      input: prompt,
      max_output_tokens: 1000,
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Groq API request failed: ${response.status} ${response.statusText} - ${body}`);
  }

  const data = await response.json();
  const text = data?.output?.[0]?.content?.[0]?.text || '';
  return JSON.parse(text);
}

export async function classifyIncident(incidentData) {
  try {
    if (openaiClient) {
      logger.info('ai.classifying', { provider: 'openai', model: config.openaiModel });
      return await classifyWithOpenAI(incidentData);
    }

    if (anthropicClient) {
      logger.info('ai.classifying', { provider: 'anthropic', model: config.anthropicModel });
      return await classifyWithAnthropic(incidentData);
    }

    if (config.groqApiKey) {
      logger.info('ai.classifying', { provider: 'groq', model: config.groqModel });
      return await classifyWithGroq(incidentData);
    }

    throw new Error('No AI API key configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY or GROQ_API_KEY.');
  } catch (error) {
    logger.error('ai.classification.failed', { error: error.message, incidentData });
    throw error;
  }
}
