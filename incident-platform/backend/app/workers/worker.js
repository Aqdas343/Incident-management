import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../config.js';
import { processIncidentAi } from './ai_worker.js';
import { checkEscalationRules, escalateIfUnresolved } from './escalation_worker.js';
import { logger } from '../utils/logger.js';
import { initRedis, isRedisAvailable } from '../services/redis_client.js';
import { queueDeadLetterMessage } from './queue.js';
import { createDeadLetterMessage } from '../models/incident.js';

await initRedis();

if (!isRedisAvailable()) {
  logger.warn('worker.redis.disabled', { reason: 'Redis unavailable, workers will not start' });
  process.exit(0);
}

const connection = {
  connection: {
    url: config.redisUrl,
    maxRetriesPerRequest: null,
  },
};

const aiWorker = new Worker(
  'ai_queue',
  async (job) => {
    if (job.name === 'process_incident_ai') {
      return processIncidentAi(job.data.incidentId);
    }
  },
  connection,
);
aiWorker.on('error', (error) => {
  logger.warn('aiWorker.redis.error', { error: error?.message || String(error) });
});
aiWorker.on('failed', async (job, err) => {
  logger.warn('aiWorker.job_failed', {
    jobId: job.id,
    name: job.name,
    attemptsMade: job.attemptsMade,
    failedReason: err?.message || String(err),
  });
  if (job.attemptsMade >= (job.opts?.attempts || 1)) {
    await queueDeadLetterMessage({
      queue: 'ai_queue',
      jobName: job.name,
      payload: job.data,
      error: err?.message || String(err),
    });
  }
});

const escalationWorker = new Worker(
  'escalation_queue',
  async (job) => {
    if (job.name === 'check_escalation_rules') {
      return checkEscalationRules(job.data.incidentId);
    }
    if (job.name === 'escalate_if_unresolved') {
      return escalateIfUnresolved(job.data.incidentId, job.data.targetLevel);
    }
  },
  connection,
);
escalationWorker.on('error', (error) => {
  logger.warn('escalationWorker.redis.error', { error: error?.message || String(error) });
});
escalationWorker.on('failed', async (job, err) => {
  logger.warn('escalationWorker.job_failed', {
    jobId: job.id,
    name: job.name,
    attemptsMade: job.attemptsMade,
    failedReason: err?.message || String(err),
  });
  if (job.attemptsMade >= (job.opts?.attempts || 1)) {
    await queueDeadLetterMessage({
      queue: 'escalation_queue',
      jobName: job.name,
      payload: job.data,
      error: err?.message || String(err),
    });
  }
});

const deadLetterWorker = new Worker(
  'dead_letter_queue',
  async (job) => {
    await createDeadLetterMessage({
      queue: job.data.queue,
      jobName: job.data.jobName,
      payload: job.data.payload,
      error: job.data.error,
    });
  },
  connection,
);
deadLetterWorker.on('completed', (job) => {
  logger.info('dead_letter.processed', { jobId: job.id, queue: job.data.queue, jobName: job.data.jobName });
});
deadLetterWorker.on('error', (error) => {
  logger.warn('deadLetterWorker.redis.error', { error: error?.message || String(error) });
});

const heartbeatClient = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
});

function heartbeat(key) {
  heartbeatClient.set(key, Date.now().toString(), 'EX', 30).catch((error) => {
    logger.warn('worker.heartbeat.failed', { key, error: error?.message || String(error) });
  });
}

heartbeat('worker:ai:heartbeat');
heartbeat('worker:escalation:heartbeat');
heartbeat('worker:deadletter:heartbeat');

const heartbeatIntervals = [
  setInterval(() => heartbeat('worker:ai:heartbeat'), 15000),
  setInterval(() => heartbeat('worker:escalation:heartbeat'), 15000),
  setInterval(() => heartbeat('worker:deadletter:heartbeat'), 15000),
];

async function shutdown() {
  logger.info('worker.shutdown', { reason: 'process exit' });
  heartbeatIntervals.forEach(clearInterval);
  try {
    await heartbeatClient.disconnect();
  } catch (error) {
    logger.warn('worker.heartbeat.disconnect_failed', { error: error?.message || String(error) });
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('beforeExit', shutdown);

logger.info('worker.started');
