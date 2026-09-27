import { prisma } from '../lib/prisma.js';
import { assertPatientAccess, portalPatientIds } from './access/patientAccess.js';
import type { PrescriptionSnapshot } from './pdf/prescriptionPdf.js';
import type { Principal } from './auth/principal.js';

export type TimelineType = 'CONSULTATION' | 'PRESCRIPTION' | 'LAB' | 'IMAGING' | 'DOCUMENT' | 'VITALS';

export interface TimelineItem {
  id: string;
  type: TimelineType;
  date: string;
  title: string;
  summary: string[];
  refId: string;
  status?: string;
}

/**
 * Longitudinal patient timeline. Portal users see finalized/released content only; clinicians
 * with a care relationship see the full record.
 */
export async function getTimeline(p: Principal, patientId: string, types: string[] | undefined, limit: number): Promise<TimelineItem[]> {
  const portal = (await portalPatientIds(p, 'clinical')).includes(patientId);
  if (!portal) await assertPatientAccess(p, patientId, 'clinical');
  const want = (t: TimelineType) => !types || types.includes(t);
  const items: TimelineItem[] = [];

  if (want('CONSULTATION')) {
    const encs = await prisma.encounter.findMany({
      where: { patientId, ...(portal ? { status: 'COMPLETED' } : { status: { not: 'CANCELLED' } }) },
      include: { doctor: { select: { displayName: true } }, diagnoses: { where: { status: 'ACTIVE' } }, prescriptions: { where: { status: { in: ['FINALIZED', 'AMENDED'] } }, include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } } },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    for (const e of encs) {
      const rxItems = e.prescriptions.reduce((n, rx) => n + ((rx.versions[0]?.snapshot as unknown as PrescriptionSnapshot | undefined)?.items.length ?? 0), 0);
      items.push({
        id: `enc:${e.id}`,
        type: 'CONSULTATION',
        date: e.startedAt.toISOString(),
        title: 'Consultation',
        summary: [
          `Doctor: ${e.doctor.displayName}`,
          ...(e.diagnoses.length ? [`Diagnosis: ${e.diagnoses.map((d) => d.description).join(', ')}`] : []),
          ...(rxItems ? [`Prescription: ${rxItems} medicine${rxItems === 1 ? '' : 's'}`] : []),
          ...(e.followUpDate ? [`Follow-up: ${e.followUpDate.toISOString().slice(0, 10)}`] : []),
        ],
        refId: e.id,
        status: e.status,
      });
    }
  }
  if (want('PRESCRIPTION')) {
    const rxs = await prisma.prescription.findMany({ where: { patientId, status: { in: ['FINALIZED', 'AMENDED'] } }, include: { doctor: { select: { displayName: true } } }, orderBy: { finalizedAt: 'desc' }, take: limit });
    for (const r of rxs) {
      items.push({ id: `rx:${r.id}`, type: 'PRESCRIPTION', date: (r.finalizedAt ?? r.createdAt).toISOString(), title: `Prescription ${r.prescriptionNumber}`, summary: [`Doctor: ${r.doctor.displayName}`, `Version ${r.currentVersion}${r.status === 'AMENDED' ? ' (amended)' : ''}`], refId: r.id, status: r.status });
    }
  }
  if (want('LAB') || want('IMAGING')) {
    const orders = await prisma.investigationOrder.findMany({
      where: { patientId, ...(portal ? { releasedToPatientAt: { not: null } } : { status: { not: 'CANCELLED' } }) },
      include: { investigation: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    for (const o of orders) {
      const type: TimelineType = o.investigation.category === 'IMAGING' ? 'IMAGING' : 'LAB';
      if (!want(type)) continue;
      items.push({ id: `ord:${o.id}`, type, date: (o.verifiedAt ?? o.createdAt).toISOString(), title: type === 'LAB' ? 'Lab Report' : 'Imaging', summary: [o.investigation.name, portal ? 'Result available' : `Status: ${o.status}`], refId: o.id, status: o.status });
    }
  }
  if (want('DOCUMENT')) {
    const docs = await prisma.medicalDocument.findMany({ where: { patientId, deletedAt: null, type: { in: ['PATIENT_UPLOAD', 'REFERRAL_LETTER', 'DISCHARGE_SUMMARY', 'OTHER'] }, ...(portal ? { visibility: 'PATIENT_VISIBLE' } : {}) }, orderBy: { createdAt: 'desc' }, take: limit });
    for (const d of docs) items.push({ id: `doc:${d.id}`, type: 'DOCUMENT', date: d.createdAt.toISOString(), title: d.title, summary: [d.type.replace(/_/g, ' ').toLowerCase()], refId: d.id });
  }
  if (want('VITALS')) {
    const vitals = await prisma.vital.findMany({ where: { patientId, status: 'ACTIVE' }, orderBy: { measuredAt: 'desc' }, take: limit * 4 });
    const byDay = new Map<string, typeof vitals>();
    for (const v of vitals) {
      const key = v.encounterId ?? v.measuredAt.toISOString().slice(0, 10);
      byDay.set(key, [...(byDay.get(key) ?? []), v]);
    }
    for (const [key, vs] of byDay) {
      const first = vs[0];
      if (!first) continue;
      items.push({
        id: `vit:${key}`,
        type: 'VITALS',
        date: first.measuredAt.toISOString(),
        title: 'Vitals',
        summary: vs.slice(0, 6).map((v) => `${v.type.replace(/_/g, ' ').toLowerCase()}: ${Number(v.value)}${v.value2 ? `/${Number(v.value2)}` : ''} ${v.unit}`),
        refId: first.id,
      });
    }
  }
  return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}
