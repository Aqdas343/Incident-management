import { logger } from '../utils/logger.js';
import { websocketManager } from '../realtime/websocket_manager.js';
import Redis from 'ioredis';
import { config } from '../config.js';
import { isRedisAvailable } from './redis_client.js';

const CHANNEL = 'incidents:events';
let publisher = null;
let subscriber = null;

function getPublisher() {
  if (!isRedisAvailable()) return null;
  if (publisher) return publisher;

  publisher = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: true,
  });
  publisher.on('error', (error) => {
    logger.warn('redis.publisher.error', { error: error?.message || String(error) });
  });
  return publisher;
}

export async function publishEvent(eventType, data) {
  websocketManager.broadcast(eventType, data);

  if (!isRedisAvailable()) {
    logger.warn('redis.publish.disabled', { eventType, reason: 'Redis unavailable' });
    return;
  }

  const client = getPublisher();
  if (!client) return;

  try {
    await client.publish(CHANNEL, JSON.stringify({ event: eventType, data }));
    logger.info('event.published', { eventType });
  } catch (error) {
    logger.warn('redis.publish.error', { error: error?.message || String(error), eventType });
  }
}

export async function subscribeToEvents(onMessage) {
  if (!isRedisAvailable()) {
    logger.warn('redis.subscribe.disabled', { reason: 'Redis unavailable' });
    return;
  }

  if (subscriber) return;

  subscriber = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    enableOfflineQueue: true,
  });
  subscriber.on('error', (error) => {
    logger.warn('redis.subscriber.error', { error: error?.message || String(error) });
  });

  try {
    await subscriber.subscribe(CHANNEL);
    subscriber.on('message', (_channel, message) => {
      try {
        const payload = JSON.parse(message);
        onMessage(payload.event, payload.data);
      } catch (error) {
        logger.error('event.subscribe.parse_failed', { error: error.message });
      }
    });
  } catch (error) {
    logger.warn('redis.subscribe.failed', { error: error?.message || String(error) });
  }
}
