import { Router } from 'express';
import { z } from 'zod';
import { ok, pageMeta, param, parseBody, parseQuery } from '../lib/http.js';
import { authenticate, requirePermission, requirePrincipal } from '../middleware/auth.js';
import { id, pagination, toPage } from '../validators/common.js';
import { prisma } from '../lib/prisma.js';
import { staffOrg, portalPatientIds } from '../services/access/patientAccess.js';
import * as notifications from '../services/notifications/notification.service.js';
import { consumeSecureLink } from '../services/secureLink.service.js';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

/** Delivery log (staff). Message bodies are never stored; variables are redacted from listings. */
notificationsRouter.get('/', requirePermission('notification:read'), async (req, res) => {
  const p = requirePrincipal(req);
  const q = parseQuery(pagination.extend({ patientId: id.optional(), status: z.string().max(30).optional(), channel: z.enum(['SMS', 'WHATSAPP', 'EMAIL']).optional() }), req);
  const page = toPage(q);
  const where = {
    patient: { organizationId: staffOrg(p) },
    ...(q.patientId ? { patientId: q.patientId } : {}),
    ...(q.status ? { status: q.status as never } : {}),
    ...(q.channel ? { channel: q.channel } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: page.skip,
      take: page.take,
      select: { id: true, patientId: true, channel: true, templateKey: true, purpose: true, status: true, attempts: true, lastError: true, createdAt: true, updatedAt: true, logs: { orderBy: { createdAt: 'asc' }, select: { id: true, provider: true, providerMessageId: true, status: true, attempt: true, sentAt: true, deliveredAt: true, readAt: true, failedAt: true, failureReason: true } } },
    }),
    prisma.notification.count({ where }),
  ]);
  ok(res, items, 200, pageMeta(page, total));
});

/** Patient's own notification history (no message bodies). */
notificationsRouter.get('/mine', async (req, res) => {
  const ids = await portalPatientIds(requirePrincipal(req), 'appointments');
  ok(res, await prisma.notification.findMany({ where: { patientId: { in: ids } }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, channel: true, templateKey: true, status: true, createdAt: true } }));
});

notificationsRouter.post('/:id/retry', requirePermission('notification:manage'), async (req, res) => {
  ok(res, { status: await notifications.retry(param(req, 'id'), requirePrincipal(req)) });
});

notificationsRouter.post('/process-due', requirePermission('notification:manage'), async (_req, res) => {
  ok(res, { processed: await notifications.processDue() });
});

/** Resolve a secure SMS/WhatsApp link — the caller must already be signed in as the patient/proxy. */
notificationsRouter.post('/secure-links/resolve', async (req, res) => {
  const p = requirePrincipal(req);
  const body = parseBody(z.object({ token: z.string().min(10).max(100) }), req);
  ok(res, await consumeSecureLink(body.token, await portalPatientIds(p, 'clinical')));
});
