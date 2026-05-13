import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const transporter = config.smtpUrl
  ? nodemailer.createTransport(config.smtpUrl)
  : null;

async function sendSlackAlert(message) {
  if (!config.slackWebhookUrl) return false;
  try {
    const response = await fetch(config.slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
    return response.ok;
  } catch (error) {
    logger.error('alert.slack.failed', { error: error.message });
    return false;
  }
}

async function sendWebhookAlert(payload) {
  if (!config.alertWebhookUrl) return false;
  try {
    const response = await fetch(config.alertWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch (error) {
    logger.error('alert.webhook.failed', { error: error.message });
    return false;
  }
}

async function sendEmailAlert(subject, text) {
  if (!transporter || !config.alertEmailTo || !config.alertEmailFrom) return false;
  try {
    await transporter.sendMail({
      from: config.alertEmailFrom,
      to: config.alertEmailTo,
      subject,
      text,
    });
    return true;
  } catch (error) {
    logger.error('alert.email.failed', { error: error.message });
    return false;
  }
}

export async function sendIncidentAlert(incident) {
  const subject = `New incident created: ${incident.service}`;
  const body = `Incident ID: ${incident.id}\nService: ${incident.service}\nTitle: ${incident.title}\nSource: ${incident.source}\nStatus: ${incident.status}`;

  const results = await Promise.all([
    sendSlackAlert(`:rotating_light: ${subject}\n${body}`),
    sendWebhookAlert({ type: 'incident_alert', incident }),
    sendEmailAlert(subject, body),
  ]);

  logger.info('alert.sent', {
    incidentId: incident.id,
    slack: results[0],
    webhook: results[1],
    email: results[2],
  });
  return results.some(Boolean);
}
