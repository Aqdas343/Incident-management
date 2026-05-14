import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { authRateLimiter } from '../services/rate_limiter.js';
import { UserCreateSchema, UserLoginSchema } from '../schemas/user.js';
import { createUser, findUserByEmail, findUserById, findUserByRefreshToken, storeRefreshToken } from '../models/user.js';

export const authRouter = express.Router();


function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    config.jwtSecret,
    { algorithm: config.jwtAlgorithm, expiresIn: `${config.accessTokenExpireMinutes}m` },
  );
}

function createTokenPair(user) {
  return {
    accessToken:  signAccessToken(user),
    refreshToken: crypto.randomBytes(32).toString('hex'),
  };
}


export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const token = authHeader.split(' ')[1];
    req.user = jwt.verify(token, config.jwtSecret, { algorithms: [config.jwtAlgorithm] });
    next();
  } catch (error) {
    logger.warn('auth.invalid_token', { error: error.message });
    return res.status(401).json({ error: 'Invalid token' });
  }
}

const ROLE_HIERARCHY = ['support_engineer', 'incident_manager', 'super_admin'];

export function requireRole(role) {
  return (req, res, next) => {
    const userRole = req.user?.role;
    if (!ROLE_HIERARCHY.includes(userRole)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (ROLE_HIERARCHY.indexOf(userRole) < ROLE_HIERARCHY.indexOf(role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

export const requireSuperAdmin              = requireRole('super_admin');
export const requireIncidentManager         = requireRole('incident_manager');
export const requireSupportEngineerOrAbove  = requireRole('support_engineer');


authRouter.post('/signup', authRateLimiter, async (req, res) => {
  const result = UserCreateSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid payload', details: result.error.format() });
  }
  const { email, password, role } = result.data;

  if (await findUserByEmail(email)) {
    return res.status(400).json({ error: 'Email already registered' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await createUser({ email, role, hashedPassword });
  const { accessToken, refreshToken } = createTokenPair(user);
  await storeRefreshToken(user.id, refreshToken);

  logger.info('auth.signup', { userId: user.id, email: user.email, role: user.role });
  res.json({ access_token: accessToken, refresh_token: refreshToken, token_type: 'bearer', user });
});

authRouter.post('/login', authRateLimiter, async (req, res) => {
  const result = UserLoginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid payload', details: result.error.format() });
  }
  const { email, password } = result.data;

  const user = await findUserByEmail(email);
  const valid = user && (await bcrypt.compare(password, user.hashed_password));
  if (!valid) {
    return res.status(401).json({ error: 'Incorrect credentials' });
  }

  const { accessToken, refreshToken } = createTokenPair(user);
  await storeRefreshToken(user.id, refreshToken);

  logger.info('auth.login', { userId: user.id, email: user.email });
  res.json({ access_token: accessToken, refresh_token: refreshToken, token_type: 'bearer', user });
});

authRouter.post('/refresh', authRateLimiter, async (req, res) => {
  const { refresh_token: refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token required' });
  }

  const user = await findUserByRefreshToken(refreshToken);
  if (!user) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }

  const { accessToken, refreshToken: nextRefreshToken } = createTokenPair(user);
  await storeRefreshToken(user.id, nextRefreshToken);

  logger.info('auth.refresh', { userId: user.id, email: user.email });
  res.json({ access_token: accessToken, refresh_token: nextRefreshToken, token_type: 'bearer', user });
});

authRouter.get('/me', authMiddleware, async (req, res) => {
  const user = await findUserById(req.user.sub);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});
