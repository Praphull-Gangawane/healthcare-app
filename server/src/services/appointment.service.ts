import { normalizeName } from '../repositories/patient.repository.js';
import { Prisma, type AppointmentSource, type AppointmentStatus, type AppointmentType } from '../generated/prisma/client.js';
import { prisma, type Tx } from '../lib/prisma.js';
import { AppError, invalidTransition, notFound } from '../lib/errors.js';
import { nextNumber } from '../lib/ids.js';
import { hoursBetween, localDate } from '../lib/time.js';
import { logger } from '../lib/logger.js';
import { canTransition, STATUS_TIMESTAMP } from '../domain/appointmentState.js';
import { audit } from './audit.service.js';
import { findSlot } from './availability.service.js';
import { getOrgSettings } from './orgSettings.js';
import { notify } from './notifications/notification.service.js';
import { issueToken } from './queue.service.js';
import { assertFacilityScope, assertPatientAccess, portalPatientIds } from './access/patientAccess.js';
import { hasPermission, type Principal } from './auth/principal.js';

export const appointmentInclude = {
  doctor: { select: { id: true, displayName: true, specialty: true } },
  department: { select: { id: true, name: true } },
  facility: { select: { id: true, name: true, timezone: true } },
  patient: { select: { id: true, uhid: true, fullName: true, dateOfBirth: true, gender: true } },
  queueToken: { select: { id: true, tokenNumber: true, status: true, queueId: true } },
  intake: { select: { id: true, submittedAt: true } },
  encounter: { select: { id: true, status: true } },
} satisfies Prisma.AppointmentInclude;

const isUniqueViolation = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

const slotTaken = () =>
  new AppError('SLOT_UNAVAILABLE', 'This slot was just booked by another patient. Please select another available time.');

function fmt(date: Date, tz: string) {
  return {
    date: new Intl.DateTimeFormat('en-IN', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' }).format(date),
    time: new Intl.DateTimeFormat('en-IN', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true }).format(date),
  };
}

export async function transition(
  tx: Tx,
  appt: { id: string; status: AppointmentStatus },
  to: AppointmentStatus,
  actorId: string | null,
  reason?: string,
  extra: Prisma.AppointmentUpdateInput = {},
) {
  if (!canTransition(appt.status, to)) throw invalidTransition(appt.status, to);
  const tsField = STATUS_TIMESTAMP[to];
  const updated = await tx.appointment.updateMany({
    where: { id: appt.id, status: appt.status },
    data: { status: to, ...(tsField ? { [tsField]: new Date() } : {}), ...(extra as Prisma.AppointmentUpdateManyMutationInput) },
  });
  if (updated.count === 0) throw new AppError('CONFLICT', 'This appointment was changed by someone else. Please refresh.');
  await tx.appointmentStatusHistory.create({
    data: { appointmentId: appt.id, fromStatus: appt.status, toStatus: to, changedById: actorId, reason: reason ?? null },
  });
}

/** Who may book for this patient, and in which facility. */
async function authorizeBooking(p: Principal, patientId: string, facilityId: string) {
  if (hasPermission(p, 'appointment:manage')) {
    const patient = await assertPatientAccess(p, patientId, 'demographics').catch(() => null);
    if (patient) {
      assertFacilityScope(p, facilityId);
      return { patient, source: 'RECEPTION' as AppointmentSource };
    }
  }
  if (hasPermission(p, 'appointment:book_self')) {
    const ids = await portalPatientIds(p, 'appointments');
    if (ids.includes(patientId)) {
      const patient = await prisma.patient.findUniqueOrThrow({ where: { id: patientId } });
      return { patient, source: 'PORTAL' as AppointmentSource };
    }
  }
  throw new AppError('FORBIDDEN', 'You cannot book appointments for this patient.');
}

export interface BookInput {
  doctorId: string;
  patientId: string;
  startAt: string;
  type: AppointmentType;
  reason?: string | undefined;
  facilityId?: string | undefined;
  /** When true, create a short HELD reservation that must be confirmed. */
  holdOnly?: boolean;
  followUpOfId?: string | undefined;
}

/**
 * Concurrency-safe booking. Seat allocation relies on the partial unique index
 * (doctorId, startAt, slotSeq) — two concurrent requests for the last seat cannot both succeed.
 */
export async function book(p: Principal, input: BookInput) {
  const startAt = new Date(input.startAt);
  if (Number.isNaN(startAt.getTime())) throw new AppError('VALIDATION_ERROR', 'Invalid start time.');
  const slot = await findSlot(input.doctorId, startAt, input.type, input.facilityId);
  if (!slot) {
    throw new AppError('DOCTOR_UNAVAILABLE', 'The doctor is not available at the selected time. Please choose another slot.');
  }
  if (slot.status !== 'AVAILABLE') throw slotTaken();

  const { patient, source } = await authorizeBooking(p, input.patientId, slot.facilityId);
  if (!patient.isActive) throw new AppError('UNPROCESSABLE', 'This patient profile is inactive.');
  const settings = await getOrgSettings(patient.organizationId);

  const existing = await prisma.appointment.findFirst({
    where: { patientId: patient.id, doctorId: input.doctorId, startAt, status: { in: ['HELD', 'BOOKED', 'CONFIRMED'] } },
  });
  if (existing) throw new AppError('CONFLICT', 'This patient already has an appointment with this doctor at that time.');

  let created: { id: string } | null = null;
  for (let seat = 0; seat < slot.capacity && !created; seat += 1) {
    try {
      created = await prisma.$transaction(async (tx) => {
        // Release expired holds on this exact slot before claiming a seat.
        await tx.appointment.updateMany({
          where: { doctorId: input.doctorId, startAt, status: 'HELD', holdExpiresAt: { lt: new Date() } },
          data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'HOLD_EXPIRED' },
        });
        const status: AppointmentStatus = input.holdOnly ? 'HELD' : 'CONFIRMED';
        const appt = await tx.appointment.create({
          data: {
            appointmentNumber: await nextNumber(tx, 'APT'),
            facilityId: slot.facilityId,
            departmentId: slot.departmentId,
            doctorId: input.doctorId,
            patientId: patient.id,
            bookedById: p.userId,
            type: input.type,
            status,
            source: input.followUpOfId ? 'FOLLOW_UP' : source,
            startAt,
            endAt: new Date(slot.endAt),
            slotSeq: seat,
            reason: input.reason ?? null,
            followUpOfId: input.followUpOfId ?? null,
            holdExpiresAt: input.holdOnly ? new Date(Date.now() + settings.holdMinutes * 60_000) : null,
            confirmedAt: input.holdOnly ? null : new Date(),
          },
        });
        await tx.appointmentStatusHistory.createMany({
          data: input.holdOnly
            ? [{ appointmentId: appt.id, fromStatus: null, toStatus: 'HELD', changedById: p.userId }]
            : [
                { appointmentId: appt.id, fromStatus: null, toStatus: 'BOOKED', changedById: p.userId },
                { appointmentId: appt.id, fromStatus: 'BOOKED', toStatus: 'CONFIRMED', changedById: p.userId },
              ],
        });
        await audit({ actor: p, action: input.holdOnly ? 'appointment.hold' : 'appointment.book', resourceType: 'Appointment', resourceId: appt.id, facilityId: slot.facilityId, after: { startAt: startAt.toISOString(), doctorId: input.doctorId, patientId: patient.id } }, tx);
        return appt;
      });
    } catch (err) {
      if (isUniqueViolation(err)) continue;
      throw err;
    }
  }
  if (!created) throw slotTaken();
  if (!input.holdOnly) await sendAppointmentNotice(created.id, 'APPOINTMENT_CONFIRMED', p);
  return getAppointmentRaw(created.id);
}

export async function confirmHold(p: Principal, appointmentId: string, reason?: string) {
  const appt = await loadForPatientAction(p, appointmentId);
  if (appt.status !== 'HELD') throw invalidTransition(appt.status, 'CONFIRMED');
  if (appt.holdExpiresAt && appt.holdExpiresAt < new Date()) {
    await prisma.$transaction((tx) => transition(tx, appt, 'CANCELLED', p.userId, 'HOLD_EXPIRED', { cancelReason: 'HOLD_EXPIRED' }));
    throw new AppError('SLOT_UNAVAILABLE', 'Your reservation expired. Please select the slot again.');
  }
  await prisma.$transaction(async (tx) => {
    await transition(tx, appt, 'CONFIRMED', p.userId, undefined, { holdExpiresAt: null, ...(reason ? { reason } : {}) });
    await audit({ actor: p, action: 'appointment.confirm', resourceType: 'Appointment', resourceId: appt.id }, tx);
  });
  await sendAppointmentNotice(appt.id, 'APPOINTMENT_CONFIRMED', p);
  return getAppointmentRaw(appt.id);
}

export async function sendAppointmentNotice(
  appointmentId: string,
  templateKey: 'APPOINTMENT_CONFIRMED' | 'APPOINTMENT_RESCHEDULED' | 'APPOINTMENT_CANCELLED' | 'APPOINTMENT_REMINDER',
  actor: Principal | null,
) {
  try {
    const a = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId }, include: { doctor: true, facility: true } });
    const { date, time } = fmt(a.startAt, a.facility.timezone);
    await notify({
      patientId: a.patientId,
      templateKey,
      variables: { doctor: a.doctor.displayName, date, time, appointmentNumber: a.appointmentNumber },
      dedupeKey: `${templateKey}:${a.id}`,
      actor,
    });
  } catch (err) {
    logger.error({ err, appointmentId, templateKey }, 'appointment notification failed');
  }
}

async function getAppointmentRaw(id: string) {
  return prisma.appointment.findUniqueOrThrow({ where: { id }, include: appointmentInclude });
}

/** Loads an appointment the principal may act on (patient/proxy or in-scope staff). */
export async function loadForPatientAction(p: Principal, appointmentId: string, staffPermission: 'appointment:manage' | 'appointment:checkin' = 'appointment:manage') {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt) throw notFound('Appointment');
  if (hasPermission(p, staffPermission) && p.organizationId) {
    const facility = await prisma.facility.findUnique({ where: { id: appt.facilityId }, select: { organizationId: true } });
    if (facility?.organizationId === p.organizationId) {
      assertFacilityScope(p, appt.facilityId);
      if (p.doctorId && appt.doctorId !== p.doctorId && !hasPermission(p, 'appointment:checkin')) {
        // Doctors manage their own appointments (e.g., follow-ups), not other doctors' lists.
        throw new AppError('FORBIDDEN', 'You can only manage your own appointments.');
      }
      return appt;
    }
  }
  const ids = await portalPatientIds(p, 'appointments');
  if (ids.includes(appt.patientId)) return appt;
  throw notFound('Appointment');
}

export async function getAppointment(p: Principal, id: string) {
  const appt = await prisma.appointment.findUnique({ where: { id }, include: { ...appointmentInclude, history: { orderBy: { changedAt: 'asc' } } } });
  if (!appt) throw notFound('Appointment');
  const ids = await portalPatientIds(p, 'appointments');
  if (ids.includes(appt.patientId)) return appt;
  if (hasPermission(p, 'appointment:read') && p.organizationId) {
    const f = await prisma.facility.findUnique({ where: { id: appt.facilityId }, select: { organizationId: true } });
    if (f?.organizationId === p.organizationId) return appt;
  }
  throw notFound('Appointment');
}

const isStaff = (p: Principal) => hasPermission(p, 'appointment:manage');

export async function cancel(p: Principal, id: string, reason?: string) {
  const appt = await loadForPatientAction(p, id);
  if (!['HELD', 'BOOKED', 'CONFIRMED', 'CHECKED_IN', 'WAITING'].includes(appt.status)) throw invalidTransition(appt.status, 'CANCELLED');
  const patient = await prisma.patient.findUniqueOrThrow({ where: { id: appt.patientId }, select: { organizationId: true } });
  const settings = await getOrgSettings(patient.organizationId);
  if (!isStaff(p) && appt.status !== 'HELD' && hoursBetween(new Date(), appt.startAt) < settings.cancellationWindowHours) {
    throw new AppError('CANCELLATION_WINDOW_CLOSED', `Online cancellation closes ${settings.cancellationWindowHours} hours before the appointment. Please contact the clinic.`);
  }
  await prisma.$transaction(async (tx) => {
    await transition(tx, appt, 'CANCELLED', p.userId, reason, { cancelReason: reason ?? null });
    await tx.queueToken.updateMany({ where: { appointmentId: appt.id, status: { in: ['WAITING', 'CALLED'] } }, data: { status: 'ABSENT' } });
    await tx.waitlistEntry.updateMany({
      where: { doctorId: appt.doctorId, preferredDate: new Date(`${appt.startAt.toISOString().slice(0, 10)}T00:00:00Z`), status: 'WAITING' },
      data: { status: 'OFFERED' },
    });
    await audit({ actor: p, action: 'appointment.cancel', resourceType: 'Appointment', resourceId: appt.id, before: { status: appt.status }, after: { status: 'CANCELLED' }, reason: reason ?? null }, tx);
  });
  if (appt.status !== 'HELD') await sendAppointmentNotice(appt.id, 'APPOINTMENT_CANCELLED', p);
  return getAppointmentRaw(appt.id);
}

export async function reschedule(p: Principal, id: string, newStartAt: string, reason?: string) {
  const appt = await loadForPatientAction(p, id);
  if (!['BOOKED', 'CONFIRMED'].includes(appt.status)) throw invalidTransition(appt.status, 'RESCHEDULED');
  const patient = await prisma.patient.findUniqueOrThrow({ where: { id: appt.patientId }, select: { organizationId: true } });
  const settings = await getOrgSettings(patient.organizationId);
  if (!isStaff(p) && hoursBetween(new Date(), appt.startAt) < settings.rescheduleWindowHours) {
    throw new AppError('RESCHEDULE_WINDOW_CLOSED', `Online rescheduling closes ${settings.rescheduleWindowHours} hours before the appointment. Please contact the clinic.`);
  }
  const start = new Date(newStartAt);
  const slot = await findSlot(appt.doctorId, start, appt.type, appt.facilityId);
  if (!slot) throw new AppError('DOCTOR_UNAVAILABLE', 'The doctor is not available at the selected time.');
  if (slot.status !== 'AVAILABLE') throw slotTaken();

  let newId: string | null = null;
  for (let seat = 0; seat < slot.capacity && !newId; seat += 1) {
    try {
      newId = await prisma.$transaction(async (tx) => {
        await transition(tx, appt, 'RESCHEDULED', p.userId, reason);
        const next = await tx.appointment.create({
          data: {
            appointmentNumber: await nextNumber(tx, 'APT'),
            facilityId: slot.facilityId,
            departmentId: slot.departmentId,
            doctorId: appt.doctorId,
            patientId: appt.patientId,
            bookedById: p.userId,
            type: appt.type,
            status: 'CONFIRMED',
            source: appt.source,
            startAt: start,
            endAt: new Date(slot.endAt),
            slotSeq: seat,
            reason: appt.reason,
            rescheduledFromId: appt.id,
            confirmedAt: new Date(),
          },
        });
        await tx.appointmentStatusHistory.create({ data: { appointmentId: next.id, fromStatus: null, toStatus: 'CONFIRMED', changedById: p.userId, reason: `Rescheduled from ${appt.appointmentNumber}` } });
        await tx.patientIntake.updateMany({ where: { appointmentId: appt.id }, data: { appointmentId: next.id } });
        await audit({ actor: p, action: 'appointment.reschedule', resourceType: 'Appointment', resourceId: appt.id, before: { startAt: appt.startAt.toISOString() }, after: { startAt: start.toISOString(), newAppointmentId: next.id } }, tx);
        return next.id;
      });
    } catch (err) {
      if (isUniqueViolation(err)) continue;
      throw err;
    }
  }
  if (!newId) throw slotTaken();
  await sendAppointmentNotice(newId, 'APPOINTMENT_RESCHEDULED', p);
  return getAppointmentRaw(newId);
}

/** Reception/nurse check-in: CHECKED_IN → WAITING with a queue token (same local day only). */
export async function checkIn(p: Principal, id: string) {
  const appt = await loadForPatientAction(p, id, 'appointment:checkin');
  const facility = await prisma.facility.findUniqueOrThrow({ where: { id: appt.facilityId } });
  if (localDate(appt.startAt, facility.timezone) !== localDate(new Date(), facility.timezone)) {
    throw new AppError('UNPROCESSABLE', 'Patients can only be checked in on the day of their appointment.');
  }
  await prisma.$transaction(async (tx) => {
    await transition(tx, appt, 'CHECKED_IN', p.userId);
    await issueToken(tx, { id: appt.id, patientId: appt.patientId, doctorId: appt.doctorId, facilityId: appt.facilityId, type: appt.type });
    await transition(tx, { id: appt.id, status: 'CHECKED_IN' }, 'WAITING', p.userId);
    await audit({ actor: p, action: 'appointment.check_in', resourceType: 'Appointment', resourceId: appt.id }, tx);
  });
  return getAppointmentRaw(appt.id);
}

export async function markNoShow(p: Principal, id: string) {
  const appt = await loadForPatientAction(p, id, 'appointment:checkin');
  if (appt.startAt > new Date()) throw new AppError('UNPROCESSABLE', 'An appointment can be marked as no-show only after its start time.');
  await prisma.$transaction(async (tx) => {
    await transition(tx, appt, 'NO_SHOW', p.userId);
    await tx.queueToken.updateMany({ where: { appointmentId: appt.id }, data: { status: 'ABSENT' } });
    await audit({ actor: p, action: 'appointment.no_show', resourceType: 'Appointment', resourceId: appt.id }, tx);
  });
  return getAppointmentRaw(appt.id);
}

/** Walk-in: not slotted (exempt from the slot index); goes straight to the queue. */
export async function createWalkIn(p: Principal, input: { patientId: string; doctorId: string; facilityId: string; reason?: string | undefined; urgent?: boolean | undefined }) {
  await assertPatientAccess(p, input.patientId, 'demographics');
  assertFacilityScope(p, input.facilityId);
  const link = await prisma.doctorDepartment.findFirst({ where: { doctorId: input.doctorId, facilityId: input.facilityId } });
  if (!link) throw new AppError('DOCTOR_UNAVAILABLE', 'This doctor does not consult at the selected facility.');
  const now = new Date();
  const id = await prisma.$transaction(async (tx) => {
    const appt = await tx.appointment.create({
      data: {
        appointmentNumber: await nextNumber(tx, 'APT'),
        facilityId: input.facilityId,
        departmentId: link.departmentId,
        doctorId: input.doctorId,
        patientId: input.patientId,
        bookedById: p.userId,
        type: input.urgent ? 'URGENT' : 'IN_PERSON',
        status: 'CHECKED_IN',
        source: 'WALK_IN',
        isWalkIn: true,
        startAt: now,
        endAt: new Date(now.getTime() + 15 * 60_000),
        reason: input.reason ?? null,
        checkedInAt: now,
      },
    });
    await tx.appointmentStatusHistory.create({ data: { appointmentId: appt.id, fromStatus: null, toStatus: 'CHECKED_IN', changedById: p.userId, reason: 'Walk-in' } });
    await issueToken(tx, { id: appt.id, patientId: appt.patientId, doctorId: appt.doctorId, facilityId: appt.facilityId, type: appt.type }, input.urgent ? 10 : 0);
    await transition(tx, { id: appt.id, status: 'CHECKED_IN' }, 'WAITING', p.userId);
    await audit({ actor: p, action: 'appointment.walk_in', resourceType: 'Appointment', resourceId: appt.id, facilityId: input.facilityId }, tx);
    return appt.id;
  });
  return getAppointmentRaw(id);
}

export interface ListQuery {
  from?: Date | undefined;
  to?: Date | undefined;
  doctorId?: string | undefined;
  facilityId?: string | undefined;
  departmentId?: string | undefined;
  patientId?: string | undefined;
  status?: AppointmentStatus[] | undefined;
  mine?: boolean | undefined;
  /** Front-desk search: appointment number, UHID, patient name or mobile digits. */
  q?: string | undefined;
  skip: number;
  take: number;
}

export async function listAppointments(p: Principal, q: ListQuery) {
  const where: Prisma.AppointmentWhereInput = {
    ...(q.from || q.to ? { startAt: { gte: q.from, lt: q.to } } : {}),
    ...(q.status?.length ? { status: { in: q.status } } : {}),
    ...(q.doctorId ? { doctorId: q.doctorId } : {}),
    ...(q.departmentId ? { departmentId: q.departmentId } : {}),
    ...(q.facilityId ? { facilityId: q.facilityId } : {}),
  };
  if (q.q) {
    const term = q.q.trim();
    const name = normalizeName(term);
    const digits = term.replace(/\D/g, '');
    const looksLikeId = /^[a-z]{2,5}-\d/i.test(term);
    where.OR = [
      { appointmentNumber: term.toUpperCase() },
      { patient: { uhid: term.toUpperCase() } },
      ...(name.length >= 2 && !looksLikeId ? [{ patient: { nameNormalized: { contains: name } } }] : []),
      ...(digits.length >= 4 && !looksLikeId ? [{ patient: { mobile: { contains: digits } } }] : []),
    ];
  }
  const portalIds = await portalPatientIds(p, 'appointments');
  const staff = hasPermission(p, 'appointment:read') && !!p.organizationId;
  if (!staff || q.mine) {
    where.patientId = q.patientId && portalIds.includes(q.patientId) ? q.patientId : { in: portalIds };
  } else {
    where.facility = { organizationId: p.organizationId! };
    if (p.facilityScope !== 'ALL') where.facilityId = q.facilityId && p.facilityScope.includes(q.facilityId) ? q.facilityId : { in: p.facilityScope };
    if (q.patientId) where.patientId = q.patientId;
    if (p.doctorId && !q.doctorId && !hasPermission(p, 'appointment:checkin')) where.doctorId = p.doctorId;
  }
  const [items, total] = await Promise.all([
    prisma.appointment.findMany({ where, include: appointmentInclude, orderBy: { startAt: q.mine || !staff ? 'desc' : 'asc' }, skip: q.skip, take: q.take }),
    prisma.appointment.count({ where }),
  ]);
  return { items, total };
}

/** Sends reminders for confirmed appointments starting within the lead window (deduplicated). */
export async function runReminders(actor: Principal | null, leadHours = 24) {
  const now = new Date();
  const upcoming = await prisma.appointment.findMany({
    where: { status: { in: ['CONFIRMED', 'BOOKED'] }, startAt: { gt: now, lte: new Date(now.getTime() + leadHours * 3_600_000) } },
    select: { id: true },
    take: 500,
  });
  for (const a of upcoming) await sendAppointmentNotice(a.id, 'APPOINTMENT_REMINDER', actor);
  return { considered: upcoming.length };
}

export async function joinWaitlist(p: Principal, input: { doctorId: string; patientId: string; preferredDate: string; note?: string | undefined }) {
  const ids = await portalPatientIds(p, 'appointments');
  if (!ids.includes(input.patientId) && !hasPermission(p, 'appointment:manage')) throw new AppError('FORBIDDEN', 'You cannot add this patient to the waiting list.');
  return prisma.waitlistEntry.create({
    data: { doctorId: input.doctorId, patientId: input.patientId, preferredDate: new Date(`${input.preferredDate}T00:00:00Z`), note: input.note ?? null },
  });
}
