import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { addDays, localDate, zonedToUtc } from '../lib/time.js';
import { fromPaise, toPaise } from '../domain/money.js';
import { staffOrg, portalPatientIds } from './access/patientAccess.js';
import { getAvailability } from './availability.service.js';
import { appointmentInclude } from './appointment.service.js';
import type { Principal } from './auth/principal.js';

const TZ = 'Asia/Kolkata';

export function dayWindow(date?: string, tz = TZ) {
  const d = date ?? localDate(new Date(), tz);
  return { date: d, from: zonedToUtc(d, '00:00', tz), to: zonedToUtc(addDays(d, 1), '00:00', tz) };
}

function facilityFilter(p: Principal): Prisma.AppointmentWhereInput {
  return { facility: { organizationId: staffOrg(p) }, ...(p.facilityScope === 'ALL' ? {} : { facilityId: { in: p.facilityScope } }) };
}

export async function doctorDashboard(p: Principal, date?: string) {
  const doctorId = p.doctorId as string;
  const { from, to, date: day } = dayWindow(date);
  const [appointments, pendingOrders, drafts, followUps, resultsToReview] = await Promise.all([
    prisma.appointment.findMany({ where: { doctorId, startAt: { gte: from, lt: to }, status: { notIn: ['CANCELLED', 'RESCHEDULED', 'HELD'] } }, include: appointmentInclude, orderBy: [{ startAt: 'asc' }] }),
    prisma.investigationOrder.count({ where: { doctorId, status: { in: ['ORDERED', 'SCHEDULED', 'COLLECTED', 'PROCESSING', 'COMPLETED'] } } }),
    prisma.prescription.findMany({ where: { doctorId, status: 'DRAFT', items: { some: {} } }, select: { id: true, prescriptionNumber: true, encounterId: true, patient: { select: { fullName: true } }, updatedAt: true } }),
    prisma.encounter.findMany({ where: { doctorId, followUpDate: { gte: from, lt: new Date(to.getTime() + 7 * 86_400_000) } }, select: { id: true, followUpDate: true, patient: { select: { id: true, fullName: true, uhid: true } } }, take: 20 }),
    prisma.investigationOrder.findMany({ where: { doctorId, status: 'VERIFIED', doctorComment: null }, include: { investigation: { select: { name: true } }, patient: { select: { id: true, fullName: true } } }, orderBy: { verifiedAt: 'desc' }, take: 10 }),
  ]);
  const current = appointments.find((a) => a.status === 'IN_CONSULTATION') ?? null;
  const waiting = appointments.filter((a) => a.status === 'WAITING' || a.status === 'CHECKED_IN');
  const next = [...waiting].sort((a, b) => (a.queueToken?.tokenNumber ?? 999) - (b.queueToken?.tokenNumber ?? 999))[0] ?? null;
  return {
    date: day,
    counts: {
      appointments: appointments.length,
      waiting: waiting.length,
      completed: appointments.filter((a) => a.status === 'COMPLETED').length,
      pendingInvestigations: pendingOrders,
      draftPrescriptions: drafts.length,
      followUps: followUps.length,
    },
    current,
    next,
    appointments,
    drafts,
    followUps,
    resultsToReview,
  };
}

export async function receptionDashboard(p: Principal, date?: string) {
  const { from, to, date: day } = dayWindow(date);
  const base = facilityFilter(p);
  const [appointments, newPatients, doctors] = await Promise.all([
    prisma.appointment.findMany({ where: { ...base, startAt: { gte: from, lt: to } }, include: appointmentInclude, orderBy: { startAt: 'asc' } }),
    prisma.patient.count({ where: { organizationId: staffOrg(p), createdAt: { gte: from, lt: to } } }),
    prisma.doctorProfile.findMany({ where: { isActive: true, user: { organizationId: staffOrg(p) } }, select: { id: true, displayName: true, specialty: true, departments: { select: { facilityId: true, department: { select: { name: true } } } } } }),
  ]);
  const byStatus = (s: string[]) => appointments.filter((a) => s.includes(a.status));
  const available = [];
  for (const d of doctors) {
    const { slots } = await getAvailability({ doctorId: d.id, date: day });
    const open = slots.filter((s) => s.status === 'AVAILABLE').length;
    if (slots.length) available.push({ ...d, openSlots: open, nextSlot: slots.find((s) => s.status === 'AVAILABLE')?.startAt ?? null });
  }
  return {
    date: day,
    counts: {
      scheduled: appointments.filter((a) => !a.isWalkIn && !['CANCELLED', 'RESCHEDULED', 'HELD'].includes(a.status)).length,
      waiting: byStatus(['WAITING', 'CHECKED_IN']).length,
      walkIns: appointments.filter((a) => a.isWalkIn).length,
      newPatients,
      noShows: byStatus(['NO_SHOW']).length,
      reschedules: byStatus(['RESCHEDULED']).length,
      cancelled: byStatus(['CANCELLED']).length,
    },
    upcoming: appointments.filter((a) => ['CONFIRMED', 'BOOKED'].includes(a.status)),
    waiting: byStatus(['WAITING', 'CHECKED_IN']),
    walkIns: appointments.filter((a) => a.isWalkIn),
    availableDoctors: available,
  };
}

export async function adminDashboard(p: Principal, q: { from?: string | undefined; to?: string | undefined }) {
  const today = dayWindow();
  const from = q.from ? zonedToUtc(q.from, '00:00', TZ) : today.from;
  const to = q.to ? zonedToUtc(addDays(q.to, 1), '00:00', TZ) : today.to;
  const base = { ...facilityFilter(p), startAt: { gte: from, lt: to } };
  const org = staffOrg(p);
  const [grouped, completedTokens, registrations, paid, pendingInvoices, byDoctor, byDept] = await Promise.all([
    prisma.appointment.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    prisma.queueToken.findMany({ where: { calledAt: { not: null }, createdAt: { gte: from, lt: to }, queue: { facility: { organizationId: org } } }, select: { createdAt: true, calledAt: true } }),
    prisma.patient.count({ where: { organizationId: org, createdAt: { gte: from, lt: to } } }),
    prisma.payment.findMany({ where: { status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] }, paidAt: { gte: from, lt: to }, invoice: { facility: { organizationId: org } } }, select: { amount: true, refundedAmount: true } }),
    prisma.invoice.findMany({ where: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, facility: { organizationId: org } }, select: { total: true, amountPaid: true } }),
    prisma.appointment.groupBy({ by: ['doctorId'], where: { ...base, status: { notIn: ['CANCELLED', 'RESCHEDULED', 'HELD'] } }, _count: { _all: true } }),
    prisma.appointment.groupBy({ by: ['departmentId'], where: { ...base, status: { notIn: ['CANCELLED', 'RESCHEDULED', 'HELD'] } }, _count: { _all: true } }),
  ]);
  const count = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
  const total = grouped.reduce((n, g) => n + g._count._all, 0);
  const avgWait = completedTokens.length ? Math.round(completedTokens.reduce((s, t) => s + ((t.calledAt as Date).getTime() - t.createdAt.getTime()), 0) / completedTokens.length / 60_000) : null;
  const revenue = paid.reduce((s, x) => s + toPaise(String(x.amount)) - toPaise(String(x.refundedAmount)), 0);
  const pending = pendingInvoices.reduce((s, i) => s + toPaise(String(i.total)) - toPaise(String(i.amountPaid)), 0);
  const [doctors, depts] = await Promise.all([
    prisma.doctorProfile.findMany({ where: { id: { in: byDoctor.map((d) => d.doctorId) } }, select: { id: true, displayName: true } }),
    prisma.department.findMany({ where: { id: { in: byDept.map((d) => d.departmentId) } }, select: { id: true, name: true } }),
  ]);
  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    appointments: total,
    completed: count('COMPLETED'),
    cancelled: count('CANCELLED'),
    noShows: count('NO_SHOW'),
    averageWaitMinutes: avgWait,
    registrations,
    revenue: fromPaise(revenue),
    pendingPayments: fromPaise(pending),
    pendingInvoices: pendingInvoices.length,
    doctorUtilization: byDoctor.map((d) => ({ doctorId: d.doctorId, name: doctors.find((x) => x.id === d.doctorId)?.displayName ?? d.doctorId, appointments: d._count._all })),
    departmentUtilization: byDept.map((d) => ({ departmentId: d.departmentId, name: depts.find((x) => x.id === d.departmentId)?.name ?? d.departmentId, appointments: d._count._all })),
  };
}

export async function patientHome(p: Principal) {
  const ids = await portalPatientIds(p, 'appointments');
  const clinicalIds = await portalPatientIds(p, 'clinical');
  const now = new Date();
  const [nextAppointments, recentRx, recentReports, recentVisits] = await Promise.all([
    prisma.appointment.findMany({ where: { patientId: { in: ids }, startAt: { gte: new Date(now.getTime() - 2 * 3_600_000) }, status: { in: ['CONFIRMED', 'BOOKED', 'CHECKED_IN', 'WAITING', 'IN_CONSULTATION'] } }, include: appointmentInclude, orderBy: { startAt: 'asc' }, take: 5 }),
    prisma.prescription.findMany({ where: { patientId: { in: clinicalIds }, status: { in: ['FINALIZED', 'AMENDED'] } }, include: { doctor: { select: { displayName: true } }, patient: { select: { fullName: true } } }, orderBy: { finalizedAt: 'desc' }, take: 5 }),
    prisma.investigationOrder.findMany({ where: { patientId: { in: clinicalIds }, releasedToPatientAt: { not: null } }, include: { investigation: { select: { name: true } }, patient: { select: { fullName: true } } }, orderBy: { releasedToPatientAt: 'desc' }, take: 5 }),
    prisma.encounter.findMany({ where: { patientId: { in: clinicalIds }, status: 'COMPLETED' }, include: { doctor: { select: { displayName: true } }, patient: { select: { fullName: true } } }, orderBy: { startedAt: 'desc' }, take: 5 }),
  ]);
  return { nextAppointment: nextAppointments[0] ?? null, upcoming: nextAppointments, recentPrescriptions: recentRx, recentReports, recentVisits };
}
