import { Router } from 'express';
import { z } from 'zod';
import { ok, pageMeta, param, parseBody, parseQuery } from '../lib/http.js';
import { authenticate, requirePermission, requirePrincipal } from '../middleware/auth.js';
import { idempotent } from '../middleware/idempotency.js';
import { id, isoDate, pagination, toPage } from '../validators/common.js';
import { intakeSchema } from '../validators/patient.schemas.js';
import * as appts from '../services/appointment.service.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { zonedToUtc, addDays } from '../lib/time.js';

export const appointmentsRouter = Router();
appointmentsRouter.use(authenticate);

const type = z.enum(['IN_PERSON', 'TELECONSULTATION', 'FOLLOW_UP', 'URGENT', 'DIAGNOSTIC', 'PROCEDURE']);
const status = z.enum(['AVAILABLE', 'HELD', 'BOOKED', 'CONFIRMED', 'CHECKED_IN', 'WAITING', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW']);

const bookSchema = z.object({
  doctorId: id,
  patientId: id,
  startAt: z.string().datetime({ offset: true }),
  type,
  reason: z.string().trim().max(500).optional(),
  facilityId: id.optional(),
  followUpOfId: id.optional(),
});

appointmentsRouter.get('/', async (req, res) => {
  const q = parseQuery(
    pagination.extend({
      date: isoDate.optional(),
      from: isoDate.optional(),
      to: isoDate.optional(),
      doctorId: id.optional(),
      facilityId: id.optional(),
      departmentId: id.optional(),
      patientId: id.optional(),
      status: z.string().optional().transform((v) => (v ? v.split(',').map((s) => status.parse(s.trim())) : undefined)),
      mine: z.enum(['true', 'false']).optional(),
      q: z.string().trim().max(80).optional(),
    }),
    req,
  );
  const tz = 'Asia/Kolkata';
  const fromDate = q.date ?? q.from;
  const toDate = q.date ?? q.to;
  const page = toPage(q);
  const { items, total } = await appts.listAppointments(requirePrincipal(req), {
    from: fromDate ? zonedToUtc(fromDate, '00:00', tz) : undefined,
    to: toDate ? zonedToUtc(addDays(toDate, 1), '00:00', tz) : undefined,
    doctorId: q.doctorId,
    facilityId: q.facilityId,
    departmentId: q.departmentId,
    patientId: q.patientId,
    status: q.status,
    mine: q.mine === 'true',
    q: q.q || undefined,
    ...page,
  });
  ok(res, items, 200, pageMeta(page, total));
});

/** Step 1 of the UI flow: reserve the slot briefly (HELD). */
appointmentsRouter.post('/holds', idempotent('appointment.hold'), async (req, res) => {
  const body = parseBody(bookSchema, req);
  ok(res, await appts.book(requirePrincipal(req), { ...body, holdOnly: true }), 201);
});

/** One-step booking (API clients / reception). */
appointmentsRouter.post('/', idempotent('appointment.book'), async (req, res) => {
  const body = parseBody(bookSchema, req);
  ok(res, await appts.book(requirePrincipal(req), body), 201);
});

appointmentsRouter.post('/walk-ins', requirePermission('appointment:manage'), idempotent('appointment.walkin'), async (req, res) => {
  const body = parseBody(z.object({ patientId: id, doctorId: id, facilityId: id, reason: z.string().max(500).optional(), urgent: z.boolean().optional() }), req);
  ok(res, await appts.createWalkIn(requirePrincipal(req), body), 201);
});

appointmentsRouter.post('/waitlist', async (req, res) => {
  const body = parseBody(z.object({ doctorId: id, patientId: id, preferredDate: isoDate, note: z.string().max(300).optional() }), req);
  ok(res, await appts.joinWaitlist(requirePrincipal(req), body), 201);
});

appointmentsRouter.post('/reminders/run', requirePermission('notification:manage'), async (req, res) => {
  const body = parseBody(z.object({ leadHours: z.number().int().min(1).max(72).default(24) }), req);
  ok(res, await appts.runReminders(requirePrincipal(req), body.leadHours));
});

appointmentsRouter.get('/:id', async (req, res) => ok(res, await appts.getAppointment(requirePrincipal(req), param(req, 'id'))));

appointmentsRouter.post('/:id/confirm', idempotent('appointment.confirm'), async (req, res) => {
  const body = parseBody(z.object({ reason: z.string().trim().max(500).optional() }), req);
  ok(res, await appts.confirmHold(requirePrincipal(req), param(req, 'id'), body.reason));
});

appointmentsRouter.post('/:id/cancel', async (req, res) => {
  const body = parseBody(z.object({ reason: z.string().trim().max(300).optional() }), req);
  ok(res, await appts.cancel(requirePrincipal(req), param(req, 'id'), body.reason));
});

appointmentsRouter.post('/:id/reschedule', idempotent('appointment.reschedule'), async (req, res) => {
  const body = parseBody(z.object({ startAt: z.string().datetime({ offset: true }), reason: z.string().trim().max(300).optional() }), req);
  ok(res, await appts.reschedule(requirePrincipal(req), param(req, 'id'), body.startAt, body.reason));
});

appointmentsRouter.post('/:id/check-in', requirePermission('appointment:checkin'), async (req, res) => {
  ok(res, await appts.checkIn(requirePrincipal(req), param(req, 'id')));
});

appointmentsRouter.post('/:id/no-show', requirePermission('appointment:checkin'), async (req, res) => {
  ok(res, await appts.markNoShow(requirePrincipal(req), param(req, 'id')));
});

/** Pre-visit intake (patient before arrival, or staff at the desk). */
appointmentsRouter.put('/:id/intake', async (req, res) => {
  const p = requirePrincipal(req);
  const appt = await appts.loadForPatientAction(p, param(req, 'id'), 'appointment:checkin').catch(() => appts.loadForPatientAction(p, param(req, 'id')));
  if (['COMPLETED', 'CANCELLED', 'RESCHEDULED', 'NO_SHOW'].includes(appt.status)) throw new AppError('UNPROCESSABLE', 'Intake is closed for this appointment.');
  const body = parseBody(intakeSchema, req);
  const intake = await prisma.patientIntake.upsert({
    where: { appointmentId: appt.id },
    update: { ...body, submittedById: p.userId, submittedAt: new Date() },
    create: { ...body, appointmentId: appt.id, patientId: appt.patientId, submittedById: p.userId },
  });
  await audit({ actor: p, action: 'intake.submit', resourceType: 'Appointment', resourceId: appt.id });
  ok(res, intake);
});

appointmentsRouter.get('/:id/intake', async (req, res) => {
  const p = requirePrincipal(req);
  const appt = await appts.getAppointment(p, param(req, 'id'));
  ok(res, await prisma.patientIntake.findUnique({ where: { appointmentId: appt.id } }));
});
