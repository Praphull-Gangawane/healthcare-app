import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithContext } from '../lib/requestContext.js';

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header('x-request-id');
  const requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', requestId);
  runWithContext({ requestId, ip: req.ip, userAgent: req.header('user-agent') ?? undefined }, () => next());
}
