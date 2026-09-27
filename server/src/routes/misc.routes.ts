import { Router } from 'express';
import { z } from 'zod';
import { ok, pageMeta, param, parseBody, parseQuery } from '../lib/http.js';
import { authenticate, requirePermission, requirePrincipal } from '../middleware/auth.js';
import { id, isoDate, pagination, toPage } from '../validators/common.js';
import * as tele from '../services/teleconsult.service.js';
import * as health from '../services/healthData.service.js';
import * as dash from '../services/dashboard.service.js';
import * as reports from '../services/report.service.js';
import * as privacy from '../services/privacy.service.js';
import { patientBundle } from '../services/interop.service.js';
import { queryAudit } from '../services/audit.service.js';
import { assertPatientAccess, portalPatientIds } from '../services/access/patientAccess.js';
import { AppError } from '../lib/errors.js';
import { hasPermission, type Principal } from '../services/auth/principal.js';
import { abdm } from '../integrations/abdm/abdmProvider.js';
import { prisma } from '../lib/prisma.js';

// ─── Teleconsultation ───
export const teleRouter = Router();
teleRouter.use(authenticate);
teleRouter.post('/appointments/:id/join', async (req, res) => {
  const body = parseBody(z.object({ consent: z.boolean().optional() }), req);
  ok(res, await tele.join(requirePrincipal(req), param(req, 'id'), body));
});
teleRouter.post('/appointments/:id/convert-in-person', requirePermission('teleconsult:host'), async (req, res) => {
  const body = parseBody(z.object({ note: z.string().trim().min(5).max(500) }), req);
  ok(res, await tele.convertToInPerson(requirePrincipal(req), param(req, 'id'), body.note));
});
teleRouter.post('/appointments/:id/end', requirePermission('teleconsult:host'), async (req, res) => ok(res, await tele.end(requirePrincipal(req), param(req, 'id'))));

// ─── Health data ───
export const healthRouter = Router();
healthRouter.use(authenticate);
const providerType = z.enum(['MOCK', 'APPLE_HEALTHKIT', 'ANDROID_HEALTH_CONNECT', 'WEARABLE', 'BLUETOOTH_DEVICE', 'CAMERA_PPG_DEMO']);

async function ownPatient(p: Principal, patientId: string) {
  if (!(await portalPatientIds(p, 'clinical')).includes(patientId)) {
    throw new AppError('FORBIDDEN', 'Only the patient (or their authorised caregiver) can manage health-data connections.');
  }
}

healthRouter.get('/patients/:patientId/sources', async (req, res) => {
  const p = requirePrincipal(req);
  const pid = param(req, 'patientId');
  if (!(await portalPatientIds(p, 'clinical')).includes(pid)) {
    if (!hasPermission(p, 'healthdata:read')) throw new AppError('FORBIDDEN', 'You cannot view health data.');
    await assertPatientAccess(p, pid, 'clinical');
  }
  ok(res, await health.listSources(pid));
});
healthRouter.post('/patients/:patientId/sources', async (req, res) => {
  const p = requirePrincipal(req);
  const pid = param(req, 'patientId');
  await ownPatient(p, pid);
  const body = parseBody(z.object({ providerType, scenario: z.string().max(40).optional(), deviceName: z.string().max(80).optional(), clientReportedStatus: z.enum(['GRANTED', 'DENIED']).optional() }), req);
  ok(res, await health.connectSource(pid, body.providerType, p, body), 201);
});
healthRouter.delete('/patients/:patientId/sources/:providerType', async (req, res) => {
  const p = requirePrincipal(req);
  const pid = param(req, 'patientId');
  await ownPatient(p, pid);
  ok(res, await health.revokeSource(pid, providerType.parse(param(req, 'providerType')), p));
});
healthRouter.post('/patients/:patientId/sync', async (req, res) => {
  const p = requirePrincipal(req);
  const pid = param(req, 'patientId');
  await ownPatient(p, pid);
  const body = parseBody(z.object({ providerType: providerType.default('MOCK'), scenario: z.string().max(40).optional() }), req);
  ok(res, await health.syncHeartRate(pid, body.providerType, p, body.scenario));
});
healthRouter.post('/patients/:patientId/readings', async (req, res) => {
  const p = requirePrincipal(req);
  const pid = param(req, 'patientId');
  await ownPatient(p, pid);
  const body = parseBody(z.object({ providerType, readings: z.array(z.object({ bpm: z.number(), measuredAt: z.string().datetime({ offset: true }), externalId: z.string().min(1).max(100), context: z.string().max(40).optional(), deviceName: z.string().max(80).optional() })).min(1).max(500) }), req);
  ok(res, await health.ingestHeartRate(pid, body.providerType, body.readings, p), 201);
});
healthRouter.get('/patients/:patientId/readings', async (req, res) => {
  const p = requirePrincipal(req);
  const pid = param(req, 'patientId');
  if (!(await portalPatientIds(p, 'clinical')).includes(pid)) {
    if (!hasPermission(p, 'healthdata:read')) throw new AppError('FORBIDDEN', 'You cannot view health data.');
    await assertPatientAccess(p, pid, 'clinical');
  }
  ok(res, await health.listReadings(pid));
});
healthRouter.post('/readings/:readingId/promote', requirePermission('vital:write'), async (req, res) => {
  const p = requirePrincipal(req);
  const body = parseBody(z.object({ encounterId: id.optional() }), req);
  const reading = await prisma.healthDataReading.findUnique({ where: { id: param(req, 'readingId') }, select: { patientId: true } });
  if (!reading) throw new AppError('NOT_FOUND', 'Reading not found.');
  await assertPatientAccess(p, reading.patientId, 'clinical');
  ok(res, await health.promoteToVital(param(req, 'readingId'), body.encounterId, p), 201);
});

// ─── Dashboards ───
export const dashboardRouter = Router();
dashboardRouter.use(authenticate);
dashboardRouter.get('/patient', requirePermission('portal:self'), async (req, res) => ok(res, await dash.patientHome(requirePrincipal(req))));
dashboardRouter.get('/doctor', requirePermission('encounter:write'), async (req, res) => {
  const q = parseQuery(z.object({ date: isoDate.optional() }), req);
  ok(res, await dash.doctorDashboard(requirePrincipal(req), q.date));
});
dashboardRouter.get('/reception', requirePermission('appointment:checkin', 'appointment:manage'), async (req, res) => {
  const q = parseQuery(z.object({ date: isoDate.optional() }), req);
  ok(res, await dash.receptionDashboard(requirePrincipal(req), q.date));
});
dashboardRouter.get('/admin', requirePermission('report:operational'), async (req, res) => {
  const q = parseQuery(z.object({ from: isoDate.optional(), to: isoDate.optional() }), req);
  ok(res, await dash.adminDashboard(requirePrincipal(req), q));
});

// ─── Reports ───
export const reportsRouter = Router();
reportsRouter.use(authenticate);
const rangeSchema = z.object({ from: isoDate, to: isoDate, doctorId: id.optional(), departmentId: id.optional(), facilityId: id.optional(), status: z.enum(['HELD', 'BOOKED', 'CONFIRMED', 'CHECKED_IN', 'WAITING', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW']).optional(), format: z.enum(['json', 'csv']).default('json') });

function sendReport(res: import('express').Response, format: 'json' | 'csv', name: string, rows: Record<string, unknown>[], data: unknown) {
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
    res.send(reports.toCsv(rows));
    return;
  }
  ok(res, data);
}

reportsRouter.get('/appointments', requirePermission('report:operational'), async (req, res) => {
  const q = parseQuery(rangeSchema, req);
  const data = await reports.appointmentReport(requirePrincipal(req), q);
  if (q.format === 'csv') await reports.auditExport(requirePrincipal(req), 'appointments', q);
  sendReport(res, q.format, 'appointments', data.rows, data);
});
reportsRouter.get('/patients', requirePermission('report:operational'), async (req, res) => ok(res, await reports.patientReport(requirePrincipal(req), parseQuery(rangeSchema, req))));
reportsRouter.get('/doctors', requirePermission('report:operational'), async (req, res) => {
  const q = parseQuery(rangeSchema, req);
  const rows = await reports.doctorReport(requirePrincipal(req), q);
  if (q.format === 'csv') await reports.auditExport(requirePrincipal(req), 'doctors', q);
  sendReport(res, q.format, 'doctors', rows, rows);
});
reportsRouter.get('/revenue', requirePermission('report:financial'), async (req, res) => ok(res, await reports.revenueReport(requirePrincipal(req), parseQuery(rangeSchema, req))));
reportsRouter.get('/clinical', requirePermission('report:clinical'), async (req, res) => ok(res, await reports.clinicalReport(requirePrincipal(req), parseQuery(rangeSchema, req))));

// ─── Audit ───
export const auditRouter = Router();
auditRouter.use(authenticate);
auditRouter.get('/', requirePermission('audit:read'), async (req, res) => {
  const p = requirePrincipal(req);
  const q = parseQuery(pagination.extend({ actorUserId: id.optional(), action: z.string().max(60).optional(), resourceType: z.string().max(60).optional(), resourceId: z.string().max(64).optional(), from: isoDate.optional(), to: isoDate.optional() }), req);
  const page = toPage(q);
  const { items, total } = await queryAudit(p.roles.includes('SUPER_ADMIN') ? null : p.organizationId, {
    ...q,
    from: q.from ? new Date(`${q.from}T00:00:00Z`) : undefined,
    to: q.to ? new Date(`${q.to}T23:59:59Z`) : undefined,
    ...page,
  });
  ok(res, items, 200, pageMeta(page, total));
});

// ─── Privacy ───
export const privacyRouter = Router();
privacyRouter.use(authenticate);
privacyRouter.get('/patients/:patientId/export', async (req, res) => {
  const data = await privacy.exportPatientData(requirePrincipal(req), param(req, 'patientId'));
  res.setHeader('Content-Disposition', 'attachment; filename="my-health-data.json"');
  res.setHeader('Cache-Control', 'no-store');
  ok(res, data);
});
privacyRouter.post('/requests', async (req, res) => {
  const body = parseBody(z.object({ patientId: id, type: z.enum(['DATA_EXPORT', 'CORRECTION', 'ACCOUNT_DEACTIVATION', 'ERASURE']), details: z.string().max(2000).optional() }), req);
  ok(res, await privacy.createRequest(requirePrincipal(req), body), 201);
});
privacyRouter.get('/requests/mine', async (req, res) => ok(res, await privacy.myRequests(requirePrincipal(req))));
privacyRouter.get('/requests', requirePermission('privacy:manage'), async (req, res) => ok(res, await privacy.listRequests(requirePrincipal(req))));
privacyRouter.post('/requests/:id/resolve', requirePermission('privacy:manage'), async (req, res) => {
  const body = parseBody(z.object({ status: z.enum(['IN_REVIEW', 'COMPLETED', 'REJECTED']), resolution: z.string().trim().min(3).max(1000) }), req);
  ok(res, await privacy.resolveRequest(requirePrincipal(req), param(req, 'id'), body));
});

// ─── Interoperability ───
export const interopRouter = Router();
interopRouter.use(authenticate);
interopRouter.get('/fhir/Patient/:id/everything', async (req, res) => {
  res.setHeader('Content-Type', 'application/fhir+json');
  res.json(await patientBundle(requirePrincipal(req), param(req, 'id')));
});
interopRouter.get('/abdm/status', async (_req, res) => ok(res, { provider: abdm.name, connected: false, note: 'ABDM integration is mocked. Production requires sandbox onboarding, certification and credentials.' }));

export { pageMeta };
