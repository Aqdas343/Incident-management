import { Queue } from 'bullmq';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { isRedisAvailable } from '../services/redis_client.js';

let aiQueue = null;
let escalationQueue = null;
let deadLetterQueue = null;

const connectionOptions = {
  connection: {
    url: config.redisUrl,
    maxRetriesPerRequest: null,
  },
};

function createQueues() {
  if (!isRedisAvailable()) {
    logger.warn('redis.queues.disabled', { url: config.redisUrl });
    return;
  }

  if (!aiQueue) {
    aiQueue = new Queue('ai_queue', {
      ...connectionOptions,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 86400 },
        removeOnFail: false,
      },
    });
    aiQueue.on('error', (error) => {
      logger.warn('aiQueue.redis.error', { error: error?.message || String(error) });
    });
  }

  if (!escalationQueue) {
    escalationQueue = new Queue('escalation_queue', {
      ...connectionOptions,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 30000 },
        removeOnComplete: { age: 86400 },
        removeOnFail: false,
      },
    });
    escalationQueue.on('error', (error) => {
      logger.warn('escalationQueue.redis.error', { error: error?.message || String(error) });
    });
  }

  if (!deadLetterQueue) {
    deadLetterQueue = new Queue('dead_letter_queue', {
      ...connectionOptions,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: false,
      },
    });
    deadLetterQueue.on('error', (error) => {
      logger.warn('deadLetterQueue.redis.error', { error: error?.message || String(error) });
    });
  }
}

export async function queueIncidentForClassification(incidentId) {
  if (!isRedisAvailable()) {
    logger.warn('queue.disabled', { reason: 'Redis unavailable, skipping AI classification', incidentId });
    return;
  }
  createQueues();
  if (!aiQueue) return;
  try {
    await aiQueue.add('process_incident_ai', { incidentId }, { jobId: `classify-${incidentId}` });
  } catch (error) {
    logger.warn('queue.add.failed', { queue: 'ai_queue', error: error?.message || String(error) });
  }
}

export async function queueEscalationCheck(incidentId) {
  if (!isRedisAvailable()) {
    logger.warn('queue.disabled', { reason: 'Redis unavailable, skipping escalation check', incidentId });
    return;
  }
  createQueues();
  if (!escalationQueue) return;
  try {
    await escalationQueue.add('check_escalation_rules', { incidentId }, { jobId: `check-${incidentId}` });
  } catch (error) {
    logger.warn('queue.add.failed', { queue: 'escalation_queue', error: error?.message || String(error) });
  }
}

export async function queueEscalationTimeouts(incidentId) {
  if (!isRedisAvailable()) {
    logger.warn('queue.disabled', { reason: 'Redis unavailable, skipping escalation timeouts', incidentId });
    return;
  }
  createQueues();
  if (!escalationQueue) return;
  try {
    await Promise.all([
      escalationQueue.add('escalate_if_unresolved', { incidentId, targetLevel: 2 }, {
        delay: 900000,
        jobId: `escalate-${incidentId}-2`,
      }),
      escalationQueue.add('escalate_if_unresolved', { incidentId, targetLevel: 3 }, {
        delay: 1800000,
        jobId: `escalate-${incidentId}-3`,
      }),
    ]);
  } catch (error) {
    logger.warn('queue.add.failed', { queue: 'escalation_queue', error: error?.message || String(error) });
  }
}

export async function queueDeadLetterMessage({ queue, jobName, payload, error }) {
  if (!isRedisAvailable()) {
    logger.warn('queue.dead_letter.disabled', { queue, jobName, error });
    return;
  }
  createQueues();
  if (!deadLetterQueue) return;
  try {
    await deadLetterQueue.add(
      'save_dead_letter',
      { queue, jobName, payload, error },
      { jobId: `deadletter-${queue}-${jobName}-${Date.now()}` },
    );
  } catch (enqueueError) {
    logger.warn('queue.dead_letter.add_failed', {
      queue,
      jobName,
      error: enqueueError?.message || String(enqueueError),
    });
  }
}

export async function getQueueStatus() {
  createQueues();
  if (!isRedisAvailable()) {
    return { redisAvailable: false, message: 'Redis unavailable' };
  }

  const status = {};
  if (aiQueue) {
    status.ai = await aiQueue.getJobCounts('waiting', 'active', 'failed', 'delayed', 'completed');
  }
  if (escalationQueue) {
    status.escalation = await escalationQueue.getJobCounts('waiting', 'active', 'failed', 'delayed', 'completed');
  }
  if (deadLetterQueue) {
    status.deadLetter = await deadLetterQueue.getJobCounts('waiting', 'active', 'failed', 'delayed', 'completed');
  }
  return status;
}
