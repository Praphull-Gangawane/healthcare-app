import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { canonicalJson, sha256 } from '../lib/crypto.js';

const TTL_HOURS = 24;
const IN_PROGRESS = 0;

/**
 * Idempotency-Key support for unsafe operations (booking, payment, finalization, sends).
 * Same key + same payload → the stored response is replayed. Same key + different payload → 422.
 * A concurrent duplicate while the first is still running → 409 REQUEST_IN_PROGRESS.
 */
export function idempotent(routeKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = req.header('idempotency-key');
    const userId = req.principal?.userId;
    if (!key || !userId) return next();
    if (!/^[\w-]{8,128}$/.test(key)) throw new AppError('VALIDATION_ERROR', 'Invalid Idempotency-Key header.');

    const route = `${routeKey}:${req.originalUrl.split('?')[0]}`;
    const requestHash = sha256(canonicalJson(req.body ?? {}));

    const existing = await prisma.idempotencyRecord.findUnique({ where: { key_userId_route: { key, userId, route } } });
    if (existing && existing.expiresAt > new Date()) {
      if (existing.requestHash !== requestHash) {
        throw new AppError('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used with a different request.');
      }
      if (existing.responseStatus === IN_PROGRESS) {
        throw new AppError('REQUEST_IN_PROGRESS', 'An identical request is still being processed.');
      }
      res.setHeader('Idempotent-Replay', 'true');
      res.status(existing.responseStatus).json(existing.responseBody);
      return;
    }
    if (existing) await prisma.idempotencyRecord.delete({ where: { id: existing.id } });

    try {
      await prisma.idempotencyRecord.create({
        data: {
          key, userId, route, requestHash, responseStatus: IN_PROGRESS, responseBody: {},
          expiresAt: new Date(Date.now() + TTL_HOURS * 3_600_000),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError('REQUEST_IN_PROGRESS', 'An identical request is still being processed.');
      }
      throw err;
    }

    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      const status = res.statusCode;
      // Persist the outcome BEFORE the response leaves: a client that retries immediately after
      // receiving it must get the stored replay, not a spurious 409 REQUEST_IN_PROGRESS.
      const write =
        status < 500
          ? prisma.idempotencyRecord.update({
              where: { key_userId_route: { key, userId, route } },
              data: { responseStatus: status, responseBody: JSON.parse(JSON.stringify(body ?? null)) as Prisma.InputJsonValue },
            })
          : prisma.idempotencyRecord.delete({ where: { key_userId_route: { key, userId, route } } });
      write
        .catch(() => undefined)
        .finally(() => {
          originalJson(body);
        });
      return res;
    };
    next();
  };
}
