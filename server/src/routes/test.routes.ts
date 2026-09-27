import { Router } from 'express';
import { z } from 'zod';
import { ok, parseBody, parseQuery } from '../lib/http.js';
import { authenticate, requirePrincipal } from '../middleware/auth.js';
import { mockOutbox } from '../providers/notification/mock.js';
import * as notifications from '../services/notifications/notification.service.js';
import { prisma } from '../lib/prisma.js';
import { sha256 } from '../lib/crypto.js';

/**
 * Development/test-only helpers. Mounted ONLY when ENABLE_TEST_ROUTES=true (refused in
 * production by config validation). Used by Playwright to inspect the mock outbox, simulate
 * provider failures/receipts and expire links/sessions deterministically.
 */
export const testRouter = Router();
const channel = z.enum(['SMS', 'WHATSAPP', 'EMAIL']);

testRouter.get('/outbox', (req, res) => {
  const q = parseQuery(z.object({ to: z.string().optional(), channel: channel.optional() }), req);
  ok(res, mockOutbox.list(q));
});
testRouter.delete('/outbox', (_req, res) => {
  mockOutbox.clear();
  ok(res, { cleared: true });
});
testRouter.post('/notification-failure-mode', (req, res) => {
  const body = parseBody(z.object({ channel, mode: z.enum(['none', 'retryable', 'permanent']) }), req);
  mockOutbox.setFailureMode(body.channel, body.mode);
  ok(res, body);
});
testRouter.post('/notifications/process-due', async (_req, res) => {
  await prisma.notification.updateMany({ where: { status: 'QUEUED' }, data: { nextAttemptAt: new Date() } });
  ok(res, { processed: await notifications.processDue() });
});
testRouter.post('/notifications/receipt', async (req, res) => {
  const body = parseBody(z.object({ providerMessageId: z.string(), status: z.enum(['DELIVERED', 'READ', 'FAILED']) }), req);
  ok(res, { updated: await notifications.recordReceipt(body.providerMessageId, body.status) });
});
testRouter.post('/secure-links/expire', async (req, res) => {
  const body = parseBody(z.object({ token: z.string() }), req);
  const r = await prisma.secureLink.updateMany({ where: { tokenHash: sha256(body.token) }, data: { expiresAt: new Date(Date.now() - 1000) } });
  ok(res, { expired: r.count });
});
testRouter.post('/sessions/expire-mine', authenticate, async (req, res) => {
  const p = requirePrincipal(req);
  await prisma.session.update({ where: { id: p.sessionId }, data: { expiresAt: new Date(Date.now() - 1000) } });
  ok(res, { expired: true });
});
