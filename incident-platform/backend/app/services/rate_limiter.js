import rateLimit from 'express-rate-limit';

const WINDOW_MS = 60 * 1000; // 1 minute

export const authRateLimiter = rateLimit({
  windowMs:       WINDOW_MS,
  max:            10,
  message:        { error: 'Too many auth requests, please try again later' },
  standardHeaders: true,
  legacyHeaders:  false,
});

export const webhookRateLimiter = rateLimit({
  windowMs:       WINDOW_MS,
  max:            100,
  message:        { error: 'Too many webhook requests, please try again later' },
  standardHeaders: true,
  legacyHeaders:  false,
});
