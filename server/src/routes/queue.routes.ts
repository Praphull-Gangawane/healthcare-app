import { Router } from 'express';
import { z } from 'zod';
import { ok, param, parseBody, parseQuery } from '../lib/http.js';
import { authenticate, requirePermission, requirePrincipal } from '../middleware/auth.js';
import { id, isoDate } from '../validators/common.js';
import * as queue from '../services/queue.service.js';

export const queueRouter = Router();

/** Public display board: token numbers only (no names or clinical details). */
queueRouter.get('/display/:queueId', async (req, res) => ok(res, await queue.getPublicDisplay(param(req, 'queueId'))));

queueRouter.use(authenticate);

queueRouter.get('/', requirePermission('queue:read'), async (req, res) => {
  const q = parseQuery(z.object({ doctorId: id, facilityId: id, date: isoDate.optional() }), req);
  ok(res, await queue.getQueueView(requirePrincipal(req), q));
});

queueRouter.post('/:queueId/call-next', requirePermission('queue:manage'), async (req, res) => ok(res, await queue.callNext(requirePrincipal(req), param(req, 'queueId'))));
queueRouter.post('/tokens/:tokenId/recall', requirePermission('queue:manage'), async (req, res) => ok(res, await queue.recall(requirePrincipal(req), param(req, 'tokenId'))));
queueRouter.post('/tokens/:tokenId/skip', requirePermission('queue:manage'), async (req, res) => ok(res, await queue.skip(requirePrincipal(req), param(req, 'tokenId'))));
queueRouter.post('/tokens/:tokenId/requeue', requirePermission('queue:manage'), async (req, res) => ok(res, await queue.requeue(requirePrincipal(req), param(req, 'tokenId'))));
queueRouter.post('/tokens/:tokenId/absent', requirePermission('queue:manage'), async (req, res) => ok(res, await queue.markAbsent(requirePrincipal(req), param(req, 'tokenId'))));
queueRouter.post('/tokens/:tokenId/transfer', requirePermission('queue:manage'), async (req, res) => {
  const body = parseBody(z.object({ doctorId: id }), req);
  ok(res, await queue.transfer(requirePrincipal(req), param(req, 'tokenId'), body.doctorId));
});
