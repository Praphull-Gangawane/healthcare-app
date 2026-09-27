import type { AppointmentStatus, Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { addDays, zonedToUtc } from '../lib/time.js';
import { fromPaise, toPaise } from '../domain/money.js';
import { audit } from './audit.service.js';
import { staffOrg } from './access/patientAccess.js';
import type { Principal } from './auth/principal.js';

const TZ = 'Asia/Kolkata';

export interface RangeQuery {
  from: string;
  to: string;
  doctorId?: string | undefined;
  departmentId?: string | undefined;
  facilityId?: string | undefined;
  status?: AppointmentStatus | undefined;
}

const range = (q: RangeQuery) => ({ gte: zonedToUtc(q.from, '00:00', TZ), lt: zonedToUtc(addDays(q.to, 1), '00:00', TZ) });

function scope(p: Principal, q: RangeQuery): Prisma.AppointmentWhereInput {
  return {
    facility: { organizationId: staffOrg(p) },
    ...(p.facilityScope === 'ALL' ? (q.facilityId ? { facilityId: q.facilityId } : {}) : { facilityId: { in: p.facilityScope } }),
    ...(q.doctorId ? { doctorId: q.doctorId } : {}),
    ...(q.departmentId ? { departmentId: q.departmentId } : {}),
  };
}

/** Operational report — no clinical content. */
export async function appointmentReport(p: Principal, q: RangeQuery) {
  const where: Prisma.AppointmentWhereInput = { ...scope(p, q), startAt: range(q), ...(q.status ? { status: q.status } : {}) };
  const [rows, byStatus] = await Promise.all([
    prisma.appointment.findMany({
      where,
      select: { appointmentNumber: true, startAt: true, status: true, type: true, source: true, isWalkIn: true, doctor: { select: { displayName: true } }, department: { select: { name: true } }, patient: { select: { uhid: true } } },
      orderBy: { startAt: 'asc' },
      take: 5000,
    }),
    prisma.appointment.groupBy({ by: ['status'], where, _count: { _all: true } }),
  ]);
  return {
    summary: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
    rows: rows.map((r) => ({ appointmentNumber: r.appointmentNumber, startAt: r.startAt.toISOString(), status: r.status, type: r.type, source: r.source, walkIn: r.isWalkIn, doctor: r.doctor.displayName, department: r.department.name, patientUhid: r.patient.uhid })),
  };
}

export async function patientReport(p: Principal, q: RangeQuery) {
  const org = staffOrg(p);
  const created = await prisma.patient.findMany({ where: { organizationId: org, createdAt: range(q) }, select: { createdAt: true } });
  const visits = await prisma.appointment.findMany({ where: { ...scope(p, q), startAt: range(q), status: 'COMPLETED' }, select: { patientId: true, patient: { select: { createdAt: true } } } });
  const start = zonedToUtc(q.from, '00:00', TZ);
  const returning = new Set(visits.filter((v) => v.patient.createdAt < start).map((v) => v.patientId));
  const fresh = new Set(visits.filter((v) => v.patient.createdAt >= start).map((v) => v.patientId));
  const trend = new Map<string, number>();
  for (const c of created) {
    const k = c.createdAt.toISOString().slice(0, 10);
    trend.set(k, (trend.get(k) ?? 0) + 1);
  }
  return { newRegistrations: created.length, newPatientsSeen: fresh.size, returningPatientsSeen: returning.size, registrationTrend: [...trend.entries()].sort().map(([date, count]) => ({ date, count })) };
}

export async function doctorReport(p: Principal, q: RangeQuery) {
  const grouped = await prisma.appointment.groupBy({ by: ['doctorId', 'status'], where: { ...scope(p, q), startAt: range(q) }, _count: { _all: true } });
  const doctors = await prisma.doctorProfile.findMany({ where: { id: { in: [...new Set(grouped.map((g) => g.doctorId))] } }, select: { id: true, displayName: true, specialty: true } });
  return doctors.map((d) => {
    const mine = grouped.filter((g) => g.doctorId === d.id);
    const c = (s: string) => mine.find((m) => m.status === s)?._count._all ?? 0;
    return { doctorId: d.id, doctor: d.displayName, specialty: d.specialty, appointments: mine.reduce((n, m) => n + m._count._all, 0), completed: c('COMPLETED'), cancelled: c('CANCELLED'), noShows: c('NO_SHOW') };
  });
}

export async function revenueReport(p: Principal, q: RangeQuery) {
  const org = staffOrg(p);
  const items = await prisma.invoiceItem.findMany({
    where: { invoice: { facility: { organizationId: org }, status: { in: ['PAID', 'PARTIALLY_PAID'] }, issuedAt: range(q) } },
    select: { amount: true, service: { select: { category: true } } },
  });
  const payments = await prisma.payment.findMany({ where: { invoice: { facility: { organizationId: org } }, OR: [{ paidAt: range(q) }, { refundedAt: range(q) }] }, select: { amount: true, refundedAmount: true, status: true, method: true } });
  const sum = (arr: { amount: unknown }[]) => arr.reduce((s, x) => s + toPaise(String(x.amount)), 0);
  const consultation = items.filter((i) => (i.service?.category ?? 'CONSULTATION') === 'CONSULTATION');
  const services = items.filter((i) => i.service && i.service.category !== 'CONSULTATION');
  const refunds = payments.reduce((s, x) => s + toPaise(String(x.refundedAmount)), 0);
  const byMethod: Record<string, string> = {};
  for (const pm of payments.filter((x) => x.status !== 'FAILED')) byMethod[pm.method] = fromPaise(toPaise(byMethod[pm.method] ?? '0') + toPaise(String(pm.amount)));
  return { consultationRevenue: fromPaise(sum(consultation)), serviceRevenue: fromPaise(sum(services)), refunds: fromPaise(refunds), collectedByMethod: byMethod };
}

/** Clinical report (report:clinical): aggregated counts only, scoped to the doctor's own encounters. */
export async function clinicalReport(p: Principal, q: RangeQuery) {
  const where: Prisma.DiagnosisWhereInput = { status: 'ACTIVE', createdAt: range(q), encounter: { doctorId: p.doctorId ?? '__none__' } };
  const dx = await prisma.diagnosis.groupBy({ by: ['description'], where, _count: { _all: true }, orderBy: { _count: { description: 'desc' } }, take: 20 });
  const encounters = await prisma.encounter.count({ where: { doctorId: p.doctorId ?? '__none__', startedAt: range(q), status: 'COMPLETED' } });
  return { completedEncounters: encounters, topDiagnoses: dx.map((d) => ({ description: d.description, count: d._count._all })) };
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0] as object);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // CSV/formula injection guard
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}

export async function auditExport(p: Principal, report: string, q: RangeQuery) {
  await audit({ actor: p, action: 'data.export', resourceType: 'Report', resourceId: report, after: { ...q } });
}
