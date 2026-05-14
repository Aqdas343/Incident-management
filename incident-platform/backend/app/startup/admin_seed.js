import bcrypt from 'bcrypt';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { findUserByEmail, createUser } from '../models/user.js';

export async function ensureDefaultAdmin() {
  if (!config.defaultAdminEmail || !config.defaultAdminPassword) return;

  const existing = await findUserByEmail(config.defaultAdminEmail);
  if (existing) return;

  const hashedPassword = await bcrypt.hash(config.defaultAdminPassword, 10);
  await createUser({ email: config.defaultAdminEmail, role: 'super_admin', hashedPassword });
  logger.info('default_admin.created', { email: config.defaultAdminEmail });
}
