import { Router } from 'express';
import { ok, pageMeta, param, parseBody, parseQuery } from '../lib/http.js';
import { authenticate, requirePermission, requirePrincipal } from '../middleware/auth.js';
import { AppError } from '../lib/errors.js';
import { toPage } from '../validators/common.js';
import * as schemas from '../validators/patient.schemas.js';
import * as patients from '../services/patient.service.js';
import { searchPatients } from '../repositories/patient.repository.js';
import { assertPatientAccess, portalPatientIds, staffOrg } from '../services/access/patientAccess.js';
import { getTimeline } from '../services/timeline.service.js';
import { consentHistory, getConsents, setConsent } from '../services/notifications/consent.service.js';
import { hasPermission, type Principal } from '../services/auth/principal.js';
import { prisma } from '../lib/prisma.js';
import { audit } from '../services/audit.service.js';

export const patientsRouter = Router();
patientsRouter.use(authenticate);

const breakGlass = (h: string | undefined) => (h ? decodeURIComponent(h).slice(0, 300) : undefined);

/** Portal self/proxy or staff with the given purpose. */
async function access(p: Principal, patientId: string, purpose: 'demographics' | 'clinical', reason?: string) {
  const portal = await portalPatientIds(p, purpose === 'clinical' ? 'clinical' : 'appointments');
  if (portal.includes(patientId)) return;
  await assertPatientAccess(p, patientId, purpose, { breakGlassReason: reason });
}

patientsRouter.get('/', requirePermission('patient:search'), async (req, res) => {
  const p = requirePrincipal(req);
  const q = parseQuery(schemas.searchPatientsSchema, req);
  const page = toPage(q);
  const { items, total } = await searchPatients({ organizationId: staffOrg(p), ...q, ...page });
  await audit({ actor: p, action: 'patient.search', resourceType: 'Patient', after: { resultCount: items.length } });
  ok(res, items, 200, pageMeta(page, total));
});

patientsRouter.post('/', requirePermission('patient:create'), async (req, res) => {
  const p = requirePrincipal(req);
  const body = parseBody(schemas.createPatientSchema, req);
  const patient = await patients.createPatient(body, { organizationId: staffOrg(p), actor: p, source: 'RECEPTION', isStaff: true });
  ok(res, patient, 201);
});

patientsRouter.get('/me/dependents', async (req, res) => {
  ok(res, await patients.listDependents(requirePrincipal(req).userId));
});

patientsRouter.post('/me/dependents', requirePermission('portal:self'), async (req, res) => {
  const p = requirePrincipal(req);
  const body = parseBody(schemas.addDependentSchema, req);
  if (!p.selfPatientId) throw new AppError('UNPROCESSABLE', 'Complete your own profile first.');
  const self = await prisma.patient.findUniqueOrThrow({ where: { id: p.selfPatientId } });
  ok(res, await patients.addDependent(p.userId, body, p, self.organizationId), 201);
});

patientsRouter.post('/me/dependents/:proxyId/revoke', requirePermission('portal:self'), async (req, res) => {
  const p = requirePrincipal(req);
  const link = await prisma.patientGuardian.findUnique({ where: { id: param(req, 'proxyId') } });
  if (!link || (link.proxyUserId !== p.userId && link.patientId !== p.selfPatientId)) throw new AppError('NOT_FOUND', 'Not found.');
  ok(res, await patients.setProxyStatus(link.id, 'REVOKED', p));
});

patientsRouter.get('/:id', async (req, res) => {
  const p = requirePrincipal(req);
  const id = param(req, 'id');
  await access(p, id, 'demographics');
  ok(res, await patients.getDemographics(id));
});

patientsRouter.patch('/:id', async (req, res) => {
  const p = requirePrincipal(req);
  const id = param(req, 'id');
  const portal = await portalPatientIds(p, 'clinical');
  if (!portal.includes(id)) {
    if (!hasPermission(p, 'patient:update')) throw new AppError('FORBIDDEN', 'You cannot edit patient details.');
    await assertPatientAccess(p, id, 'demographics');
  }
  ok(res, await patients.updatePatient(id, parseBody(schemas.updatePatientSchema, req), p));
});

patientsRouter.get('/:id/medical-profile', async (req, res) => {
  const p = requirePrincipal(req);
  const id = param(req, 'id');
  await access(p, id, 'clinical', breakGlass(req.header('x-access-reason')));
  ok(res, await patients.getMedicalProfile(id));
});

patientsRouter.post('/:id/allergies', async (req, res) => {
  const p = requirePrincipal(req);
  const id = param(req, 'id');
  if (!hasPermission(p, 'clinical:write') && !(await portalPatientIds(p, 'clinical')).includes(id)) throw new AppError('FORBIDDEN', 'You cannot add allergies.');
  await access(p, id, 'clinical');
  ok(res, await patients.addAllergy(id, parseBody(schemas.allergySchema, req), p), 201);
});

patientsRouter.post('/:id/history', async (req, res) => {
  const p = requirePrincipal(req);
  const id = param(req, 'id');
  if (!hasPermission(p, 'clinical:write') && !(await portalPatientIds(p, 'clinical')).includes(id)) throw new AppError('FORBIDDEN', 'You cannot add history.');
  await access(p, id, 'clinical');
  ok(res, await patients.addHistoryEntry(id, parseBody(schemas.historyEntrySchema, req), p), 201);
});

patientsRouter.delete('/:id/allergies/:recordId', requirePermission('clinical:write'), async (req, res) => {
  const p = requirePrincipal(req);
  await assertPatientAccess(p, param(req, 'id'), 'clinical');
  await patients.deactivateRecord('allergy', param(req, 'recordId'), param(req, 'id'), p);
  ok(res, { deactivated: true });
});

patientsRouter.get('/:id/timeline', async (req, res) => {
  const p = requirePrincipal(req);
  const q = parseQuery(schemas.timelineQuerySchema, req);
  ok(res, await getTimeline(p, param(req, 'id'), q.types, q.limit));
});

patientsRouter.get('/:id/proxies', async (req, res) => {
  const p = requirePrincipal(req);
  const id = param(req, 'id');
  await access(p, id, 'demographics');
  ok(res, await prisma.patientGuardian.findMany({ where: { patientId: id }, include: { proxy: { select: { displayName: true, email: true } } } }));
});

patientsRouter.post('/:id/proxies/:proxyId/activate', requirePermission('patient:update'), async (req, res) => {
  const p = requirePrincipal(req);
  await assertPatientAccess(p, param(req, 'id'), 'demographics');
  ok(res, await patients.setProxyStatus(param(req, 'proxyId'), 'ACTIVE', p));
});

patientsRouter.get('/:id/consents', async (req, res) => {
  const p = requirePrincipal(req);
  const id = param(req, 'id');
  await access(p, id, 'demographics');
  ok(res, { current: await getConsents(id), history: await consentHistory(id) });
});

patientsRouter.put('/:id/consents', async (req, res) => {
  const p = requirePrincipal(req);
  const id = param(req, 'id');
  const portal = (await portalPatientIds(p, 'clinical')).includes(id);
  if (!portal) {
    if (!hasPermission(p, 'patient:update')) throw new AppError('FORBIDDEN', 'You cannot change consents.');
    await assertPatientAccess(p, id, 'demographics');
  }
  const body = parseBody(schemas.consentUpdateSchema, req);
  await setConsent({ patientId: id, channel: body.channel, optedIn: body.optedIn, source: portal ? 'PORTAL' : 'RECEPTION', actor: p });
  ok(res, { current: await getConsents(id) });
});
