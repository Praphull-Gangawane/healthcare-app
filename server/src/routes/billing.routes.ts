import { Router } from 'express';
import { z } from 'zod';
import { ok, pageMeta, param, parseBody, parseQuery } from '../lib/http.js';
import { authenticate, requirePermission, requirePrincipal } from '../middleware/auth.js';
import { idempotent } from '../middleware/idempotency.js';
import { id, money, pagination, toPage } from '../validators/common.js';
import * as billing from '../services/billing.service.js';

export const billingRouter = Router();
billingRouter.use(authenticate);

billingRouter.get('/services', async (req, res) => {
  const q = parseQuery(z.object({ facilityId: id }), req);
  ok(res, await billing.listServices(q.facilityId));
});

billingRouter.put('/services', requirePermission('service:manage'), async (req, res) => {
  const body = parseBody(z.object({ facilityId: id, code: z.string().trim().min(1).max(30), name: z.string().trim().min(1).max(120), category: z.enum(['CONSULTATION', 'DIAGNOSTIC', 'PROCEDURE', 'OTHER']), price: money, taxRatePct: money.default('0'), isActive: z.boolean().optional() }), req);
  ok(res, await billing.upsertService(requirePrincipal(req), body));
});

billingRouter.get('/invoices', async (req, res) => {
  const q = parseQuery(pagination.extend({ patientId: id.optional(), status: z.string().max(20).optional() }), req);
  const page = toPage(q);
  const { items, total } = await billing.listInvoices(requirePrincipal(req), { patientId: q.patientId, status: q.status, ...page });
  ok(res, items, 200, pageMeta(page, total));
});

billingRouter.post('/invoices', requirePermission('billing:manage'), idempotent('invoice.create'), async (req, res) => {
  const body = parseBody(z.object({ patientId: id, facilityId: id, appointmentId: id.optional(), discount: money.optional(), items: z.array(z.object({ serviceId: id.optional(), description: z.string().trim().max(200).optional(), quantity: z.number().int().min(1).max(100).default(1), unitPrice: money.optional(), discount: money.optional() })).min(1).max(50) }), req);
  ok(res, await billing.createInvoice(requirePrincipal(req), body), 201);
});

billingRouter.post('/appointments/:appointmentId/invoice', requirePermission('billing:manage'), async (req, res) => {
  ok(res, await billing.invoiceForAppointment(requirePrincipal(req), param(req, 'appointmentId')), 201);
});

billingRouter.get('/invoices/:id', async (req, res) => ok(res, await billing.getInvoice(requirePrincipal(req), param(req, 'id'))));

billingRouter.post('/invoices/:id/payments', idempotent('payment.create'), async (req, res) => {
  const body = parseBody(z.object({ amount: money.optional(), method: z.enum(['CASH', 'CARD', 'UPI', 'ONLINE']) }), req);
  ok(res, await billing.pay(requirePrincipal(req), param(req, 'id'), body, req.header('idempotency-key') ?? undefined), 201);
});

billingRouter.post('/payments/:id/refund', requirePermission('payment:refund'), async (req, res) => {
  const body = parseBody(z.object({ amount: money.optional(), reason: z.string().trim().min(3).max(300) }), req);
  ok(res, await billing.refund(requirePrincipal(req), param(req, 'id'), body));
});
