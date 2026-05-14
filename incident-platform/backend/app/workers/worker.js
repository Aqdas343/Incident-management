import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { initRedis, isRedisAvailable } from '../services/redis_client.js';
import { processIncidentAi } from './ai_worker.js';
import { checkEscalationRules, escalateIfUnresolved } from './escalation_worker.js';
import { queueDeadLetterMessage } from './queue.js';
import { createDeadLetterMessage } from '../models/incident.js';

await initRedis();

if (!isRedisAvailable()) {
  logger.warn('worker.redis.disabled', { reason: 'Redis unavailable — workers will not start' });
  process.exit(0);
}

// BullMQ requires a proper ioredis instance, not a plain { url } object
function makeConnection() {
  return new Redis(config.redisUrl, { maxRetriesPerRequest: null, enableOfflineQueue: true });
}

function onWorkerError(name, error) {
  logger.warn(`${name}.error`, { error: error?.message || String(error) });
}

async function onWorkerFailed(name, job, err) {
  logger.warn(`${name}.job_failed`, {
    jobId:        job.id,
    name:         job.name,
    attemptsMade: job.attemptsMade,
    failedReason: err?.message || String(err),
  });
  if (job.attemptsMade >= (job.opts?.attempts || 1)) {
    await queueDeadLetterMessage({
      queue:   name,
      jobName: job.name,
      payload: job.data,
      error:   err?.message || String(err),
    });
  }
}

const aiWorker = new Worker(
  'ai_queue',
  async (job) => {
    if (job.name === 'process_incident_ai') {
      return processIncidentAi(job.data.incidentId);
    }
  },
  { connection: makeConnection() },
);
aiWorker.on('error',  (err)        => onWorkerError('aiWorker', err));
aiWorker.on('failed', (job, err)   => onWorkerFailed('ai_queue', job, err));

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
  { connection: makeConnection() },
);
escalationWorker.on('error',  (err)      => onWorkerError('escalationWorker', err));
escalationWorker.on('failed', (job, err) => onWorkerFailed('escalation_queue', job, err));

const deadLetterWorker = new Worker(
  'dead_letter_queue',
  async (job) => {
    await createDeadLetterMessage({
      queue:   job.data.queue,
      jobName: job.data.jobName,
      payload: job.data.payload,
      error:   job.data.error,
    });
  },
  { connection: makeConnection() },
);
deadLetterWorker.on('completed', (job) => {
  logger.info('dead_letter.processed', { jobId: job.id, queue: job.data.queue, jobName: job.data.jobName });
});
deadLetterWorker.on('error', (err) => onWorkerError('deadLetterWorker', err));


async function shutdown() {
  logger.info('worker.shutdown');
  await Promise.allSettled([
    aiWorker.close(),
    escalationWorker.close(),
    deadLetterWorker.close(),
  ]);
  process.exit(0);
}

process.on('SIGINT',     shutdown);
process.on('SIGTERM',    shutdown);
process.on('beforeExit', shutdown);

logger.info('worker.started');
