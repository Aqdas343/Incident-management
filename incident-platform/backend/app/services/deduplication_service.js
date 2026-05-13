import { createHash } from 'crypto';

export function generateFingerprint(service, message) {
  const normalized = `${service.trim().toLowerCase()}|${message.trim().toLowerCase()}`;
  return createHash('sha256').update(normalized).digest('hex');
}
