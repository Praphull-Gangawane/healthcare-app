import pino from 'pino';
import { config } from '../config/env.js';

/**
 * Structured logger. Sensitive values are redacted: credentials, tokens, OTPs, cookies and
 * anything that could carry clinical content. Log identifiers, never medical records.
 */
export const logger = pino({
  level: config.isTest ? 'warn' : config.LOG_LEVEL,
  base: { service: 'careflow-api' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-csrf-token"]',
      'res.headers["set-cookie"]',
      '*.password',
      '*.newPassword',
      '*.currentPassword',
      '*.passwordHash',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      '*.otp',
      '*.apiKey',
      '*.body',
      '*.content',
    ],
    censor: '[REDACTED]',
  },
});
