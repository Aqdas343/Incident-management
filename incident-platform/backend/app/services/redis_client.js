import Redis from 'ioredis';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

let redisAvailable = false;

export function isRedisAvailable() {
  return redisAvailable && Boolean(config.redisUrl);
}

export async function initRedis() {
  if (!config.redisEnabled) {
    logger.warn('redis.disabled', { reason: 'REDIS_URL not configured' });
    redisAvailable = false;
    return false;
  }

  const probe = new Redis(config.redisUrl, {
    lazyConnect:          true,
    connectTimeout:       2000,
    maxRetriesPerRequest: 0,
    retryStrategy:        null,
    enableOfflineQueue:   false,
  });

  probe.on('error', (error) => {
    logger.warn('redis.probe.error', { error: error?.message || String(error) });
  });

  try {
    await probe.connect();
    await probe.ping();
    await probe.disconnect();
    redisAvailable = true;
    logger.info('redis.available', { url: config.redisUrl });
    return true;
  } catch (error) {
    logger.warn('redis.unavailable', { error: error?.message || String(error) });
    redisAvailable = false;
    try { await probe.disconnect(); } catch { /* ignore */ }
    return false;
  }
}
