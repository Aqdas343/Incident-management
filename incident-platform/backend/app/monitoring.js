import client from 'prom-client';
import { StatsD } from 'hot-shots';
import { config } from './config.js';
import { logger } from './utils/logger.js';

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

const webhooksReceived = new client.Counter({
  name: 'incident_platform_webhooks_received_total',
  help: 'Total number of webhook ingest requests',
  labelNames: ['source'],
});

const duplicateIncidents = new client.Counter({
  name: 'incident_platform_duplicate_incidents_total',
  help: 'Total number of duplicate incidents detected',
});

const incidentsCreated = new client.Counter({
  name: 'incident_platform_incidents_created_total',
  help: 'Total number of incidents created from webhook ingestion',
});

const requestDuration = new client.Histogram({
  name: 'incident_platform_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

registry.registerMetric(webhooksReceived);
registry.registerMetric(duplicateIncidents);
registry.registerMetric(incidentsCreated);
registry.registerMetric(requestDuration);

const datadogClient = config.datadogApiKey
  ? new StatsD({
      host: config.datadogHost,
      port: config.datadogPort,
      globalTags: { service: config.serviceName },
      prefix: `${config.datadogMetricPrefix}.`,
      maxBufferSize: 0,
      errorHandler: (error) => {
        logger.error('datadog.statsd.error', { error: error?.message || String(error) });
      },
    })
  : null;

export function recordWebhookReceived(source = 'webhook') {
  webhooksReceived.inc({ source });
  datadogClient?.increment('webhooks.received', 1, [`source:${source}`]);
}

export function recordDuplicateIncident() {
  duplicateIncidents.inc();
  datadogClient?.increment('webhooks.duplicates', 1);
}

export function recordIncidentCreated() {
  incidentsCreated.inc();
  datadogClient?.increment('incidents.created', 1);
}

export function captureRequestMetrics(req, res, next) {
  const end = requestDuration.startTimer();
  res.on('finish', () => {
    end({ method: req.method, route: req.path, status_code: res.statusCode });
    datadogClient?.increment('http.requests', 1, [
      `method:${req.method}`,
      `status_code:${res.statusCode}`,
      `route:${req.route?.path || req.path}`,
    ]);
  });
  next();
}

export async function metricsRoute(_req, res) {
  res.setHeader('Content-Type', registry.contentType);
  res.end(await registry.metrics());
}
