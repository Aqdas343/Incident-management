import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { isRedisAvailable } from '../services/redis_client.js';


let aiQueue         = null;
let escalationQueue = null;
let deadLetterQueue = null;

// BullMQ requires a shared ioredis instance — passing { url } as a plain object
// is not a valid ioredis constructor option and silently fails to connect.
function makeConnection() {
  return new Redis(config.redisUrl, { maxRetriesPerRequest: null, enableOfflineQueue: true });
}

function createQueues() {
  if (!isRedisAvailable()) {
    logger.warn('redis.queues.disabled', { reason: 'Redis unavailable' });
    return;
  }

  if (!aiQueue) {
    aiQueue = new Queue('ai_queue', {
      connection: makeConnection(),
      defaultJobOptions: {
        attempts:          3,
        backoff:           { type: 'exponential', delay: 5000 },
        removeOnComplete:  { age: 86400 },
        removeOnFail:      false,
      },
    });
    aiQueue.on('error', (error) => {
      logger.warn('aiQueue.error', { error: error?.message || String(error) });
    });
  }

  if (!escalationQueue) {
    escalationQueue = new Queue('escalation_queue', {
      connection: makeConnection(),
      defaultJobOptions: {
        attempts:          2,
        backoff:           { type: 'fixed', delay: 30000 },
        removeOnComplete:  { age: 86400 },
        removeOnFail:      false,
      },
    });
    escalationQueue.on('error', (error) => {
      logger.warn('escalationQueue.error', { error: error?.message || String(error) });
    });
  }

  if (!deadLetterQueue) {
    deadLetterQueue = new Queue('dead_letter_queue', {
      connection: makeConnection(),
      defaultJobOptions: {
        attempts:         1,
        removeOnComplete: true,
        removeOnFail:     false,
      },
    });
    deadLetterQueue.on('error', (error) => {
      logger.warn('deadLetterQueue.error', { error: error?.message || String(error) });
    });
  }
}


function guardQueue(queueName) {
  if (!isRedisAvailable()) {
    logger.warn('queue.disabled', { reason: 'Redis unavailable', queue: queueName });
    return false;
  }
  createQueues();
  return true;
}

async function safeAdd(queue, queueName, jobName, data, opts = {}) {
  try {
    await queue.add(jobName, data, opts);
  } catch (error) {
    logger.warn('queue.add.failed', { queue: queueName, error: error?.message || String(error) });
  }
}


export async function queueIncidentForClassification(incidentId) {
  if (!guardQueue('ai_queue') || !aiQueue) return;
  await safeAdd(aiQueue, 'ai_queue', 'process_incident_ai', { incidentId }, {
    jobId: `classify-${incidentId}`,
  });
}

export async function queueEscalationCheck(incidentId) {
  if (!guardQueue('escalation_queue') || !escalationQueue) return;
  await safeAdd(escalationQueue, 'escalation_queue', 'check_escalation_rules', { incidentId }, {
    jobId: `check-${incidentId}`,
  });
}

export async function queueEscalationTimeouts(incidentId) {
  if (!guardQueue('escalation_queue') || !escalationQueue) return;
  await Promise.all([
    safeAdd(escalationQueue, 'escalation_queue', 'escalate_if_unresolved',
      { incidentId, targetLevel: 2 },
      { delay: 15 * 60 * 1000, jobId: `escalate-${incidentId}-2` },
    ),
    safeAdd(escalationQueue, 'escalation_queue', 'escalate_if_unresolved',
      { incidentId, targetLevel: 3 },
      { delay: 30 * 60 * 1000, jobId: `escalate-${incidentId}-3` },
    ),
  ]);
}

export async function queueDeadLetterMessage({ queue, jobName, payload, error }) {
  if (!guardQueue('dead_letter_queue') || !deadLetterQueue) {
    logger.warn('queue.dead_letter.disabled', { queue, jobName, error });
    return;
  }
  await safeAdd(
    deadLetterQueue,
    'dead_letter_queue',
    'save_dead_letter',
    { queue, jobName, payload, error },
    { jobId: `deadletter-${queue}-${jobName}-${Date.now()}` },
  );
}

export async function getQueueStatus() {
  if (!isRedisAvailable()) {
    return { redisAvailable: false, message: 'Redis unavailable' };
  }
  createQueues();

  const counts = (q) => q?.getJobCounts('waiting', 'active', 'failed', 'delayed', 'completed');
  const [ai, escalation, deadLetter] = await Promise.all([
    counts(aiQueue),
    counts(escalationQueue),
    counts(deadLetterQueue),
  ]);
  return { ai, escalation, deadLetter };
}
