import { Router } from 'express';
import { z } from 'zod';
import { ok, param, parseBody, parseQuery } from '../lib/http.js';
import { authenticate, requirePermission, requirePrincipal } from '../middleware/auth.js';
import { idempotent } from '../middleware/idempotency.js';
import { id, isoDate } from '../validators/common.js';
import * as enc from '../services/encounter.service.js';
import * as vitals from '../services/vital.service.js';
import * as rx from '../services/prescription.service.js';
import * as inv from '../services/investigation.service.js';
import { assertPatientAccess, portalPatientIds } from '../services/access/patientAccess.js';
import { AppError } from '../lib/errors.js';
import { hasPermission } from '../services/auth/principal.js';
import { prisma } from '../lib/prisma.js';

export const encountersRouter = Router();
encountersRouter.use(authenticate);

const vitalType = z.enum(['HEART_RATE', 'BLOOD_PRESSURE', 'RESPIRATORY_RATE', 'TEMPERATURE', 'OXYGEN_SATURATION', 'HEIGHT', 'WEIGHT', 'BMI']);
export const measurementSchema = z.object({
  type: vitalType,
  value: z.number(),
  value2: z.number().optional(),
  unit: z.string().max(20).optional(),
  measuredAt: z.string().datetime({ offset: true }).optional(),
});
const vitalsBody = z.object({ measurements: z.array(measurementSchema).min(1).max(20), context: z.string().max(60).optional() });

export const itemSchema = z.object({
  medicationId: id.optional(),
  medicineName: z.string().trim().min(1, 'Medicine is required').max(200),
  strength: z.string().trim().max(60).optional(),
  dose: z.string().trim().min(1, 'Dose is required').max(60),
  route: z.string().trim().min(1, 'Route is required').max(40),
  frequency: z.string().trim().min(1, 'Frequency is required').max(80),
  timing: z.string().trim().max(80).optional(),
  durationDays: z.number().int().min(1, 'Duration must be at least 1 day').max(365),
  quantity: z.string().trim().max(40).optional(),
  instructions: z.string().trim().max(500).optional(),
  refills: z.number().int().min(0).max(12).optional(),
});

encountersRouter.post('/', requirePermission('encounter:write'), idempotent('encounter.start'), async (req, res) => {
  const body = parseBody(z.object({ appointmentId: id }), req);
  ok(res, await enc.startFromAppointment(requirePrincipal(req), body.appointmentId), 201);
});

encountersRouter.get('/:id', async (req, res) => ok(res, await enc.getEncounter(requirePrincipal(req), param(req, 'id'))));

encountersRouter.patch('/:id', requirePermission('encounter:write'), async (req, res) => {
  const body = parseBody(
    z.object({
      version: z.number().int().min(1),
      chiefComplaint: z.string().max(2000).optional(),
      historyOfIllness: z.string().max(10000).optional(),
      examinationFindings: z.string().max(10000).optional(),
      assessmentNotes: z.string().max(10000).optional(),
      planNotes: z.string().max(10000).optional(),
      followUpDate: isoDate.nullable().optional(),
      followUpInstructions: z.string().max(2000).optional(),
    }),
    req,
  );
  ok(res, await enc.saveDraft(requirePrincipal(req), param(req, 'id'), body));
});

encountersRouter.post('/:id/notes', requirePermission('encounter:write'), async (req, res) => {
  const body = parseBody(z.object({ type: z.enum(['SUBJECTIVE', 'OBJECTIVE', 'ASSESSMENT', 'PLAN', 'GENERAL', 'ADDENDUM']).default('GENERAL'), content: z.string().trim().min(1).max(10000), isAiDraft: z.boolean().optional() }), req);
  ok(res, await enc.addNote(requirePrincipal(req), param(req, 'id'), body), 201);
});

encountersRouter.patch('/notes/:noteId', requirePermission('encounter:write'), async (req, res) => {
  const body = parseBody(z.object({ content: z.string().trim().min(1).max(10000) }), req);
  ok(res, await enc.updateDraftNote(requirePrincipal(req), param(req, 'noteId'), body.content));
});

encountersRouter.post('/notes/:noteId/approve-ai-draft', requirePermission('encounter:write'), async (req, res) => {
  const body = parseBody(z.object({ content: z.string().trim().min(1).max(10000).optional() }), req);
  ok(res, await enc.approveAiDraft(requirePrincipal(req), param(req, 'noteId'), body.content));
});

encountersRouter.post('/:id/diagnoses', requirePermission('encounter:write'), async (req, res) => {
  const body = parseBody(z.object({ description: z.string().trim().min(1).max(300), code: z.string().trim().max(20).optional(), codeSystem: z.enum(['ICD10', 'ICD11', 'SNOMED_CT', 'FREE_TEXT']).default('FREE_TEXT'), type: z.enum(['PRIMARY', 'SECONDARY', 'DIFFERENTIAL', 'PROVISIONAL']).default('PRIMARY') }), req);
  ok(res, await enc.addDiagnosis(requirePrincipal(req), param(req, 'id'), body), 201);
});

encountersRouter.delete('/diagnoses/:diagnosisId', requirePermission('encounter:write'), async (req, res) => {
  await enc.removeDiagnosis(requirePrincipal(req), param(req, 'diagnosisId'));
  ok(res, { removed: true });
});

encountersRouter.post('/:id/vitals', requirePermission('vital:write'), async (req, res) => {
  const p = requirePrincipal(req);
  const e = await enc.loadEncounter(p, param(req, 'id'), p.doctorId ? 'write' : 'read');
  const body = parseBody(vitalsBody, req);
  ok(res, await vitals.recordVitals({ patientId: e.patientId, encounterId: e.id, context: body.context, measurements: body.measurements }, p), 201);
});

encountersRouter.post('/:id/orders', requirePermission('investigation:order'), async (req, res) => {
  const body = parseBody(z.object({ investigationId: id, priority: z.enum(['ROUTINE', 'URGENT', 'STAT']).default('ROUTINE'), clinicalNotes: z.string().max(1000).optional() }), req);
  ok(res, await inv.orderInvestigation(requirePrincipal(req), param(req, 'id'), body), 201);
});

encountersRouter.post('/:id/prescriptions', requirePermission('prescription:write'), async (req, res) => {
  ok(res, await rx.createDraft(requirePrincipal(req), param(req, 'id')), 201);
});

encountersRouter.post('/:id/complete', requirePermission('encounter:write'), idempotent('encounter.complete'), async (req, res) => {
  const body = parseBody(z.object({ followUpDate: isoDate.optional(), followUpInstructions: z.string().max(2000).optional() }), req);
  ok(res, await enc.complete(requirePrincipal(req), param(req, 'id'), body));
});

// ─── Vitals on the patient record ───
export const vitalsRouter = Router();
vitalsRouter.use(authenticate);

vitalsRouter.get('/patients/:patientId', async (req, res) => {
  const p = requirePrincipal(req);
  const patientId = param(req, 'patientId');
  if (!(await portalPatientIds(p, 'clinical')).includes(patientId)) {
    if (!hasPermission(p, 'vital:read')) throw new AppError('FORBIDDEN', 'You cannot view vitals.');
    await assertPatientAccess(p, patientId, 'clinical');
  }
  const q = parseQuery(z.object({ type: vitalType.optional(), includeHistory: z.enum(['true', 'false']).optional(), limit: z.coerce.number().int().min(1).max(500).default(100) }), req);
  ok(res, await vitals.listVitals(patientId, { type: q.type, includeHistory: q.includeHistory === 'true', limit: q.limit }));
});

vitalsRouter.get('/patients/:patientId/trend', async (req, res) => {
  const p = requirePrincipal(req);
  const patientId = param(req, 'patientId');
  if (!(await portalPatientIds(p, 'clinical')).includes(patientId)) await assertPatientAccess(p, patientId, 'clinical');
  const q = parseQuery(z.object({ type: vitalType }), req);
  ok(res, await vitals.vitalTrend(patientId, q.type));
});

vitalsRouter.post('/patients/:patientId', async (req, res) => {
  const p = requirePrincipal(req);
  const patientId = param(req, 'patientId');
  const portal = (await portalPatientIds(p, 'clinical')).includes(patientId);
  if (!portal) {
    if (!hasPermission(p, 'vital:write')) throw new AppError('FORBIDDEN', 'You cannot record vitals.');
    await assertPatientAccess(p, patientId, 'clinical');
  }
  const body = parseBody(vitalsBody, req);
  ok(res, await vitals.recordVitals({ patientId, source: portal ? 'PATIENT_REPORTED' : 'MANUAL', context: body.context, measurements: body.measurements }, p), 201);
});

vitalsRouter.post('/:vitalId/correct', requirePermission('vital:write'), async (req, res) => {
  const p = requirePrincipal(req);
  const body = parseBody(z.object({ value: z.number(), value2: z.number().optional(), unit: z.string().min(1).max(20), reason: z.string().trim().min(3).max(300) }), req);
  const existing = await prisma.vital.findUnique({ where: { id: param(req, 'vitalId') }, select: { patientId: true } });
  if (!existing) throw new AppError('NOT_FOUND', 'Vital not found.');
  await assertPatientAccess(p, existing.patientId, 'clinical');
  ok(res, await vitals.correctVital(param(req, 'vitalId'), body, p));
});

// ─── Prescriptions ───
export const prescriptionsRouter = Router();
prescriptionsRouter.use(authenticate);

prescriptionsRouter.get('/medications', async (req, res) => {
  const q = parseQuery(z.object({ q: z.string().trim().min(1).max(60) }), req);
  ok(res, await rx.searchMedications(q.q));
});

prescriptionsRouter.get('/patients/:patientId', async (req, res) => ok(res, await rx.listForPatient(requirePrincipal(req), param(req, 'patientId'))));

prescriptionsRouter.get('/:id', async (req, res) => ok(res, await rx.getPrescription(requirePrincipal(req), param(req, 'id'))));

prescriptionsRouter.patch('/:id', requirePermission('prescription:write'), async (req, res) => {
  const body = parseBody(z.object({ advice: z.string().max(2000).optional(), followUpDate: isoDate.nullable().optional(), investigationNotes: z.string().max(1000).optional(), items: z.array(itemSchema).max(30).optional() }), req);
  ok(res, await rx.updateDraft(requirePrincipal(req), param(req, 'id'), body));
});

prescriptionsRouter.post('/:id/items', requirePermission('prescription:write'), async (req, res) => {
  ok(res, await rx.addItem(requirePrincipal(req), param(req, 'id'), parseBody(itemSchema, req)), 201);
});

prescriptionsRouter.patch('/:id/items/:itemId', requirePermission('prescription:write'), async (req, res) => {
  ok(res, await rx.updateItem(requirePrincipal(req), param(req, 'id'), param(req, 'itemId'), parseBody(itemSchema.partial(), req)));
});

prescriptionsRouter.delete('/:id/items/:itemId', requirePermission('prescription:write'), async (req, res) => {
  ok(res, await rx.removeItem(requirePrincipal(req), param(req, 'id'), param(req, 'itemId')));
});

prescriptionsRouter.post('/:id/reorder', requirePermission('prescription:write'), async (req, res) => {
  const body = parseBody(z.object({ itemIds: z.array(id).min(1).max(30) }), req);
  ok(res, await rx.reorderItems(requirePrincipal(req), param(req, 'id'), body.itemIds));
});

prescriptionsRouter.post('/:id/finalize', requirePermission('prescription:finalize'), idempotent('prescription.finalize'), async (req, res) => {
  const body = parseBody(z.object({ confirm: z.literal(true, { errorMap: () => ({ message: 'Explicit confirmation is required to finalize' }) }) }), req);
  void body;
  ok(res, await rx.finalize(requirePrincipal(req), param(req, 'id')));
});

prescriptionsRouter.post('/:id/amend', requirePermission('prescription:finalize'), idempotent('prescription.amend'), async (req, res) => {
  const body = parseBody(z.object({ reason: z.string().trim().min(5, 'Please give a reason for the amendment').max(500), items: z.array(itemSchema).min(1).max(30), advice: z.string().max(2000).optional(), followUpDate: isoDate.nullable().optional(), investigationNotes: z.string().max(1000).optional() }), req);
  ok(res, await rx.amend(requirePrincipal(req), param(req, 'id'), body));
});

prescriptionsRouter.delete('/:id', requirePermission('prescription:write'), async (req, res) => {
  await rx.discardDraft(requirePrincipal(req), param(req, 'id'));
  ok(res, { discarded: true });
});
