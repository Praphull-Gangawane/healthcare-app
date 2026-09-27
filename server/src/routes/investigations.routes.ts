import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config/env.js';
import { ok, pageMeta, param, parseBody, parseQuery } from '../lib/http.js';
import { authenticate, requirePermission, requirePrincipal } from '../middleware/auth.js';
import { pagination, toPage } from '../validators/common.js';
import * as inv from '../services/investigation.service.js';

export const investigationsRouter = Router();
investigationsRouter.use(authenticate);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.UPLOAD_MAX_BYTES, files: 1 } });
const status = z.enum(['ORDERED', 'SCHEDULED', 'COLLECTED', 'PROCESSING', 'COMPLETED', 'VERIFIED', 'CANCELLED']);

investigationsRouter.get('/catalog', async (req, res) => {
  const q = parseQuery(z.object({ q: z.string().trim().max(60).optional() }), req);
  ok(res, await inv.listCatalog(q.q));
});

investigationsRouter.get('/worklist', requirePermission('investigation:process'), async (req, res) => {
  const q = parseQuery(pagination.extend({ status: z.string().optional().transform((v) => (v ? v.split(',').map((s) => status.parse(s.trim())) : undefined)), facilityId: z.string().optional() }), req);
  const page = toPage(q);
  const { items, total } = await inv.worklist(requirePrincipal(req), { status: q.status, facilityId: q.facilityId, ...page });
  ok(res, items, 200, pageMeta(page, total));
});

investigationsRouter.get('/patients/:patientId', async (req, res) => ok(res, await inv.listForPatient(requirePrincipal(req), param(req, 'patientId'))));

investigationsRouter.get('/patients/:patientId/trend', async (req, res) => {
  const q = parseQuery(z.object({ parameterCode: z.string().trim().min(1).max(30) }), req);
  ok(res, await inv.parameterTrend(requirePrincipal(req), param(req, 'patientId'), q.parameterCode));
});

investigationsRouter.get('/orders/:id', async (req, res) => ok(res, await inv.getOrder(requirePrincipal(req), param(req, 'id'))));

investigationsRouter.post('/orders/:id/status', async (req, res) => {
  const body = parseBody(z.object({ status, reason: z.string().max(300).optional() }), req);
  ok(res, await inv.changeStatus(requirePrincipal(req), param(req, 'id'), body.status, body.reason));
});

investigationsRouter.post('/orders/:id/results', requirePermission('investigation:process'), async (req, res) => {
  const body = parseBody(
    z.object({
      results: z.array(z.object({ parameterCode: z.string().min(1).max(30), valueNumeric: z.number().optional(), valueText: z.string().max(500).optional(), unit: z.string().max(20).optional(), refLow: z.number().optional(), refHigh: z.number().optional(), refText: z.string().max(100).optional(), abnormal: z.boolean().optional() })).min(1).max(50),
      correctionReason: z.string().trim().min(3).max(300).optional(),
    }),
    req,
  );
  ok(res, await inv.enterResults(requirePrincipal(req), param(req, 'id'), body.results, body.correctionReason));
});

investigationsRouter.post('/orders/:id/report', requirePermission('investigation:process'), upload.single('file'), async (req, res) => {
  const summary = typeof req.body?.summary === 'string' ? req.body.summary.slice(0, 1000) : undefined;
  ok(res, await inv.attachReport(requirePrincipal(req), param(req, 'id'), req.file, summary), 201);
});

investigationsRouter.post('/orders/:id/verify', requirePermission('investigation:verify'), async (req, res) => ok(res, await inv.verify(requirePrincipal(req), param(req, 'id'))));

investigationsRouter.post('/orders/:id/comment', requirePermission('clinical:write'), async (req, res) => {
  const body = parseBody(z.object({ comment: z.string().trim().min(1).max(2000) }), req);
  ok(res, await inv.addDoctorComment(requirePrincipal(req), param(req, 'id'), body.comment));
});
