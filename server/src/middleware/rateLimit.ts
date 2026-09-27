import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { config } from '../config/env.js';

const handler = (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) =>
  res.status(429).json({
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' },
  });

/** Brute-force protection for credential endpoints (per IP + submitted email). */
export const loginLimiter = rateLimit({
  windowMs: config.LOGIN_RATE_LIMIT_WINDOW_MS,
  limit: config.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().slice(0, 120) : '';
    return `${ipKeyGenerator(req.ip ?? 'unknown')}|${email}`;
  },
  handler,
});

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: config.API_RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
});
