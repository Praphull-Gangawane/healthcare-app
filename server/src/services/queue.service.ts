import type { AppointmentType, TokenStatus } from '../generated/prisma/client.js';
import { prisma, type Tx } from '../lib/prisma.js';
import { AppError, notFound } from '../lib/errors.js';
import { dateOnly, localDate } from '../lib/time.js';
import { audit } from './audit.service.js';
import { assertFacilityScope, staffOrg } from './access/patientAccess.js';
import { notify } from './notifications/notification.service.js';
import type { Principal } from './auth/principal.js';

/** Returns (creating if needed) today's queue for a doctor at a facility. */
async function getOrCreateQueue(tx: Tx, doctorId: string, facilityId: string, date: string) {
  const queueDate = dateOnly(date);
  const existing = await tx.queue.findUnique({ where: { doctorId_facilityId_queueDate: { doctorId, facilityId, queueDate } } });
  if (existing) return existing;
  const schedule = await tx.doctorSchedule.findFirst({ where: { doctorId, facilityId, roomId: { not: null } }, select: { roomId: true } });
  return tx.queue.upsert({
    where: { doctorId_facilityId_queueDate: { doctorId, facilityId, queueDate } },
    update: {},
    create: { doctorId, facilityId, queueDate, roomId: schedule?.roomId ?? null },
  });
}

/** Allocates the next token number atomically for an appointment. */
export async function issueToken(
  tx: Tx,
  appt: { id: string; patientId: string; doctorId: string; facilityId: string; type: AppointmentType },
  priority = 0,
) {
  const facility = await tx.facility.findUniqueOrThrow({ where: { id: appt.facilityId }, select: { timezone: true } });
  const queue = await getOrCreateQueue(tx, appt.doctorId, appt.facilityId, localDate(new Date(), facility.timezone));
  const bumped = await tx.queue.update({ where: { id: queue.id }, data: { lastTokenNumber: { increment: 1 } } });
  return tx.queueToken.create({
    data: { queueId: queue.id, appointmentId: appt.id, patientId: appt.patientId, tokenNumber: bumped.lastTokenNumber, priority },
  });
}

async function loadQueueForStaff(p: Principal, queueId: string) {
  const q = await prisma.queue.findUnique({ where: { id: queueId }, include: { facility: { select: { organizationId: true } } } });
  if (!q || q.facility.organizationId !== staffOrg(p)) throw notFound('Queue');
  assertFacilityScope(p, q.facilityId);
  if (p.doctorId && q.doctorId !== p.doctorId && !p.permissions.has('appointment:checkin')) {
    throw new AppError('FORBIDDEN', 'You can only manage your own queue.');
  }
  return q;
}

const ORDER = [{ priority: 'desc' as const }, { tokenNumber: 'asc' as const }];

function summarize(tokens: { status: TokenStatus; createdAt: Date; calledAt: Date | null; tokenNumber: number }[]) {
  const waiting = tokens.filter((t) => t.status === 'WAITING');
  const served = tokens.filter((t) => t.calledAt);
  const avgWaitMinutes = served.length
    ? Math.round(served.reduce((sum, t) => sum + ((t.calledAt as Date).getTime() - t.createdAt.getTime()), 0) / served.length / 60_000)
    : null;
  return { waitingCount: waiting.length, avgWaitMinutes };
}

export async function getQueueView(p: Principal, input: { doctorId: string; facilityId: string; date?: string | undefined }) {
  staffOrg(p);
  assertFacilityScope(p, input.facilityId);
  const facility = await prisma.facility.findUniqueOrThrow({ where: { id: input.facilityId } });
  const date = input.date ?? localDate(new Date(), facility.timezone);
  const queue = await prisma.queue.findUnique({
    where: { doctorId_facilityId_queueDate: { doctorId: input.doctorId, facilityId: input.facilityId, queueDate: dateOnly(date) } },
    include: {
      room: { select: { name: true, code: true } },
      doctor: { select: { displayName: true } },
      tokens: {
        orderBy: ORDER,
        include: {
          patient: { select: { id: true, uhid: true, fullName: true, gender: true, dateOfBirth: true } },
          appointment: { select: { id: true, appointmentNumber: true, type: true, startAt: true, isWalkIn: true, status: true, reason: true } },
        },
      },
    },
  });
  if (!queue) return { queue: null, date, nowServing: null, next: null, waitingCount: 0, avgWaitMinutes: null, tokens: [] };
  const nowServing = queue.tokens.find((t) => t.status === 'IN_CONSULTATION') ?? queue.tokens.filter((t) => t.status === 'CALLED').sort((a, b) => (b.calledAt?.getTime() ?? 0) - (a.calledAt?.getTime() ?? 0))[0] ?? null;
  const next = queue.tokens.find((t) => t.status === 'WAITING') ?? null;
  return {
    queue: { id: queue.id, status: queue.status, doctor: queue.doctor.displayName, room: queue.room },
    date,
    nowServing,
    next,
    ...summarize(queue.tokens),
    tokens: queue.tokens,
  };
}

/** Public display: token numbers and room only — never names or clinical information. */
export async function getPublicDisplay(queueId: string) {
  const q = await prisma.queue.findUnique({
    where: { id: queueId },
    include: { room: { select: { name: true } }, doctor: { select: { displayName: true } }, tokens: { orderBy: ORDER, select: { tokenNumber: true, status: true, calledAt: true, createdAt: true } } },
  });
  if (!q) throw notFound('Queue');
  const serving = q.tokens.filter((t) => t.status === 'CALLED' || t.status === 'IN_CONSULTATION').sort((a, b) => (b.calledAt?.getTime() ?? 0) - (a.calledAt?.getTime() ?? 0))[0];
  return {
    doctor: q.doctor.displayName,
    room: q.room?.name ?? null,
    nowServing: serving?.tokenNumber ?? null,
    upNext: q.tokens.filter((t) => t.status === 'WAITING').slice(0, 5).map((t) => t.tokenNumber),
    waitingCount: q.tokens.filter((t) => t.status === 'WAITING').length,
  };
}

async function setTokenStatus(p: Principal, tokenId: string, action: string, apply: (tx: Tx, token: { id: string; status: TokenStatus; appointmentId: string | null; queueId: string; patientId: string; tokenNumber: number }) => Promise<void>) {
  const token = await prisma.queueToken.findUnique({ where: { id: tokenId } });
  if (!token) throw notFound('Token');
  await loadQueueForStaff(p, token.queueId);
  await prisma.$transaction(async (tx) => {
    await apply(tx, token);
    await audit({ actor: p, action: `queue.${action}`, resourceType: 'QueueToken', resourceId: token.id, before: { status: token.status } }, tx);
  });
  return prisma.queueToken.findUniqueOrThrow({ where: { id: tokenId } });
}

export async function callNext(p: Principal, queueId: string) {
  const q = await loadQueueForStaff(p, queueId);
  const next = await prisma.queueToken.findFirst({ where: { queueId: q.id, status: 'WAITING' }, orderBy: ORDER });
  if (!next) throw new AppError('NOT_FOUND', 'No patients are waiting in this queue.');
  const updated = await prisma.queueToken.updateMany({ where: { id: next.id, status: 'WAITING' }, data: { status: 'CALLED', calledAt: new Date() } });
  if (!updated.count) throw new AppError('CONFLICT', 'The queue changed. Please try again.');
  await audit({ actor: p, action: 'queue.call_next', resourceType: 'QueueToken', resourceId: next.id });
  const room = q.roomId ? await prisma.consultationRoom.findUnique({ where: { id: q.roomId } }) : null;
  await notify({
    patientId: next.patientId,
    templateKey: 'QUEUE_CALLED',
    variables: { token: String(next.tokenNumber), room: room?.name ?? 'the consultation room' },
    dedupeKey: `QUEUE_CALLED:${next.id}:${next.recallCount}`,
    channels: ['WHATSAPP', 'SMS'],
    actor: p,
  }).catch(() => undefined);
  return prisma.queueToken.findUniqueOrThrow({ where: { id: next.id } });
}

export const recall = (p: Principal, tokenId: string) =>
  setTokenStatus(p, tokenId, 'recall', async (tx, t) => {
    if (!['CALLED', 'SKIPPED'].includes(t.status)) throw new AppError('INVALID_STATE_TRANSITION', 'Only called or skipped tokens can be re-called.');
    await tx.queueToken.update({ where: { id: t.id }, data: { status: 'CALLED', calledAt: new Date(), recallCount: { increment: 1 } } });
  });

export const skip = (p: Principal, tokenId: string) =>
  setTokenStatus(p, tokenId, 'skip', async (tx, t) => {
    if (!['WAITING', 'CALLED'].includes(t.status)) throw new AppError('INVALID_STATE_TRANSITION', 'Only waiting or called tokens can be skipped.');
    await tx.queueToken.update({ where: { id: t.id }, data: { status: 'SKIPPED' } });
  });

export const requeue = (p: Principal, tokenId: string) =>
  setTokenStatus(p, tokenId, 'requeue', async (tx, t) => {
    if (t.status !== 'SKIPPED') throw new AppError('INVALID_STATE_TRANSITION', 'Only skipped tokens can be returned to the queue.');
    await tx.queueToken.update({ where: { id: t.id }, data: { status: 'WAITING' } });
  });

export const markAbsent = (p: Principal, tokenId: string) =>
  setTokenStatus(p, tokenId, 'absent', async (tx, t) => {
    if (!['WAITING', 'CALLED', 'SKIPPED'].includes(t.status)) throw new AppError('INVALID_STATE_TRANSITION', 'This token cannot be marked absent.');
    await tx.queueToken.update({ where: { id: t.id }, data: { status: 'ABSENT' } });
    if (t.appointmentId) {
      const appt = await tx.appointment.findUnique({ where: { id: t.appointmentId } });
      if (appt && ['CHECKED_IN', 'WAITING'].includes(appt.status)) {
        await tx.appointment.update({ where: { id: appt.id }, data: { status: 'NO_SHOW', noShowAt: new Date() } });
        await tx.appointmentStatusHistory.create({ data: { appointmentId: appt.id, fromStatus: appt.status, toStatus: 'NO_SHOW', changedById: p.userId, reason: 'Marked absent from queue' } });
      }
    }
  });

/**
 * Moves a waiting patient to another doctor's queue at the same facility. The appointment is
 * re-assigned and becomes queue-based (isWalkIn) so it no longer occupies the original slot.
 */
export async function transfer(p: Principal, tokenId: string, targetDoctorId: string) {
  const token = await prisma.queueToken.findUnique({ where: { id: tokenId }, include: { queue: true } });
  if (!token) throw notFound('Token');
  await loadQueueForStaff(p, token.queueId);
  if (!['WAITING', 'SKIPPED', 'CALLED'].includes(token.status)) throw new AppError('INVALID_STATE_TRANSITION', 'Only waiting patients can be moved.');
  const link = await prisma.doctorDepartment.findFirst({ where: { doctorId: targetDoctorId, facilityId: token.queue.facilityId } });
  if (!link) throw new AppError('DOCTOR_UNAVAILABLE', 'The selected doctor does not consult at this facility.');
  const appointmentId = token.appointmentId;
  if (!appointmentId) throw new AppError('UNPROCESSABLE', 'This token is not linked to an appointment.');
  return prisma.$transaction(async (tx) => {
    // Release the unique appointment link on the old token before issuing the new one.
    await tx.queueToken.update({ where: { id: token.id }, data: { status: 'TRANSFERRED', transferredTo: targetDoctorId, appointmentId: null } });
    const appt = await tx.appointment.update({
      where: { id: appointmentId },
      data: { doctorId: targetDoctorId, departmentId: link.departmentId, isWalkIn: true },
    });
    const newToken = await issueToken(tx, { id: appt.id, patientId: token.patientId, doctorId: targetDoctorId, facilityId: token.queue.facilityId, type: appt.type });
    await audit({ actor: p, action: 'queue.transfer', resourceType: 'QueueToken', resourceId: token.id, after: { targetDoctorId, newTokenId: newToken.id } }, tx);
    return newToken;
  });
}

/** Called by the encounter service when a consultation starts/completes. */
export async function syncTokenForAppointment(tx: Tx, appointmentId: string, status: 'IN_CONSULTATION' | 'COMPLETED') {
  await tx.queueToken.updateMany({
    where: { appointmentId },
    data: status === 'IN_CONSULTATION' ? { status, servedAt: new Date(), calledAt: new Date() } : { status, completedAt: new Date() },
  });
}
