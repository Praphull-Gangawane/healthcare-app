import type { AbnormalFlag, InvestigationStatus, OrderPriority, Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { AppError, invalidTransition, notFound } from '../lib/errors.js';
import { nextNumber } from '../lib/ids.js';
import { ageInYears } from '../lib/time.js';
import { audit } from './audit.service.js';
import { loadEncounter } from './encounter.service.js';
import { assertPatientAccess, portalPatientIds } from './access/patientAccess.js';
import { storeGeneratedDocument, validateUpload, type IncomingFile } from './document.service.js';
import { notify } from './notifications/notification.service.js';
import { createSecureLink } from './secureLink.service.js';
import { getOrgSettings } from './orgSettings.js';
import { hasPermission, inFacilityScope, type Principal } from './auth/principal.js';

export interface CatalogParameter {
  code: string;
  name: string;
  unit?: string;
  refLow?: number;
  refHigh?: number;
  refText?: string;
}

const TRANSITIONS: Record<InvestigationStatus, InvestigationStatus[]> = {
  ORDERED: ['SCHEDULED', 'COLLECTED', 'CANCELLED'],
  SCHEDULED: ['COLLECTED', 'CANCELLED'],
  COLLECTED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['VERIFIED', 'PROCESSING'],
  VERIFIED: ['PROCESSING'],
  CANCELLED: [],
};

const TIMESTAMP: Partial<Record<InvestigationStatus, keyof Prisma.InvestigationOrderUpdateInput>> = {
  COLLECTED: 'collectedAt',
  PROCESSING: 'processingAt',
  COMPLETED: 'completedAt',
  VERIFIED: 'verifiedAt',
  CANCELLED: 'cancelledAt',
};

/** Numeric results are flagged against the reference range. A flag is not a diagnosis. */
export function computeAbnormalFlag(value: number | null, refLow: number | null, refHigh: number | null): AbnormalFlag {
  if (value === null) return 'NOT_APPLICABLE';
  if (refLow !== null && value < refLow) return 'LOW';
  if (refHigh !== null && value > refHigh) return 'HIGH';
  if (refLow === null && refHigh === null) return 'NOT_APPLICABLE';
  return 'NORMAL';
}

export const listCatalog = (q?: string) =>
  prisma.investigation.findMany({
    where: { isActive: true, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }] } : {}) },
    orderBy: { name: 'asc' },
  });

const orderInclude = {
  investigation: true,
  results: { where: { status: 'ACTIVE' }, orderBy: { parameterCode: 'asc' } },
  report: true,
  doctor: { select: { id: true, displayName: true } },
  patient: { select: { id: true, uhid: true, fullName: true, dateOfBirth: true, gender: true } },
} satisfies Prisma.InvestigationOrderInclude;

export async function orderInvestigation(p: Principal, encounterId: string, input: { investigationId: string; priority: OrderPriority; clinicalNotes?: string | undefined }) {
  if (!hasPermission(p, 'investigation:order')) throw new AppError('FORBIDDEN', 'You cannot order investigations.');
  const enc = await loadEncounter(p, encounterId, 'write');
  if (enc.status !== 'IN_PROGRESS') throw new AppError('INVALID_STATE_TRANSITION', 'Investigations can be ordered during an active consultation.');
  const inv = await prisma.investigation.findFirst({ where: { id: input.investigationId, isActive: true } });
  if (!inv) throw notFound('Investigation');
  const order = await prisma.$transaction(async (tx) => {
    const o = await tx.investigationOrder.create({
      data: {
        orderNumber: await nextNumber(tx, 'ORD'),
        patientId: enc.patientId,
        doctorId: enc.doctorId,
        encounterId,
        facilityId: enc.facilityId,
        investigationId: inv.id,
        priority: input.priority,
        clinicalNotes: input.clinicalNotes ?? null,
      },
      include: orderInclude,
    });
    await audit({ actor: p, action: 'investigation.order', resourceType: 'InvestigationOrder', resourceId: o.id, after: { code: inv.code, priority: input.priority } }, tx);
    return o;
  });
  return order;
}

/** Lab worklist: facility-scoped orders with minimal patient identity — no consultation notes. */
export async function worklist(p: Principal, q: { status?: InvestigationStatus[] | undefined; facilityId?: string | undefined; skip: number; take: number }) {
  if (!hasPermission(p, 'investigation:process') || !p.organizationId) throw new AppError('FORBIDDEN', 'Lab access required.');
  const where: Prisma.InvestigationOrderWhereInput = {
    patient: { organizationId: p.organizationId },
    ...(q.status?.length ? { status: { in: q.status } } : { status: { notIn: ['CANCELLED'] } }),
    ...(p.facilityScope === 'ALL' ? (q.facilityId ? { facilityId: q.facilityId } : {}) : { facilityId: { in: p.facilityScope } }),
  };
  const [items, total] = await Promise.all([
    prisma.investigationOrder.findMany({ where, include: orderInclude, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }], skip: q.skip, take: q.take }),
    prisma.investigationOrder.count({ where }),
  ]);
  return { items: items.map((o) => ({ ...o, patient: { ...o.patient, age: ageInYears(o.patient.dateOfBirth) } })), total };
}

async function loadOrderForLab(p: Principal, orderId: string) {
  const order = await prisma.investigationOrder.findUnique({ where: { id: orderId }, include: { patient: { select: { organizationId: true } } } });
  if (!order || order.patient.organizationId !== p.organizationId) throw notFound('Order');
  if (!hasPermission(p, 'investigation:process') || !inFacilityScope(p, order.facilityId)) throw new AppError('FORBIDDEN', 'This order is outside your lab scope.');
  return order;
}

/** Read access for an order: lab (scope), ordering/treating clinician, or patient after release. */
export async function getOrder(p: Principal, orderId: string) {
  const order = await prisma.investigationOrder.findUnique({ where: { id: orderId }, include: orderInclude });
  if (!order) throw notFound('Order');
  const portal = await portalPatientIds(p, 'clinical');
  if (portal.includes(order.patientId)) {
    if (!order.releasedToPatientAt) throw notFound('Order');
    return order;
  }
  if (hasPermission(p, 'investigation:process') && p.organizationId && inFacilityScope(p, order.facilityId)) {
    const pat = await prisma.patient.findUnique({ where: { id: order.patientId }, select: { organizationId: true } });
    if (pat?.organizationId === p.organizationId) return order;
  }
  if (!hasPermission(p, 'investigation:read')) throw new AppError('FORBIDDEN', 'You do not have access to this report.');
  await assertPatientAccess(p, order.patientId, 'clinical');
  return order;
}

export async function changeStatus(p: Principal, orderId: string, to: InvestigationStatus, reason?: string) {
  let order;
  if (to === 'CANCELLED' && p.doctorId) {
    order = await prisma.investigationOrder.findUnique({ where: { id: orderId } });
    if (!order || order.doctorId !== p.doctorId) throw notFound('Order');
  } else {
    order = await loadOrderForLab(p, orderId);
  }
  if (!TRANSITIONS[order.status].includes(to) || to === 'VERIFIED' || to === 'COMPLETED') throw invalidTransition(order.status, to);
  const ts = TIMESTAMP[to];
  await prisma.investigationOrder.update({ where: { id: orderId }, data: { status: to, ...(ts ? { [ts]: new Date() } : {}), ...(to === 'SCHEDULED' ? { scheduledAt: new Date() } : {}), assignedToId: order.assignedToId ?? p.userId } });
  await audit({ actor: p, action: `investigation.status.${to.toLowerCase()}`, resourceType: 'InvestigationOrder', resourceId: orderId, before: { status: order.status }, after: { status: to }, reason: reason ?? null });
  return prisma.investigationOrder.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
}

export interface ResultInput {
  parameterCode: string;
  valueNumeric?: number | undefined;
  valueText?: string | undefined;
  unit?: string | undefined;
  refLow?: number | undefined;
  refHigh?: number | undefined;
  refText?: string | undefined;
  abnormal?: boolean | undefined;
}

/** Enter/re-enter results. Previous values are kept as CORRECTED (never overwritten). */
export async function enterResults(p: Principal, orderId: string, results: ResultInput[], correctionReason?: string) {
  const order = await loadOrderForLab(p, orderId);
  if (!['COLLECTED', 'PROCESSING', 'COMPLETED', 'VERIFIED'].includes(order.status)) {
    throw new AppError('INVALID_STATE_TRANSITION', 'Record sample collection before entering results.');
  }
  if (order.status === 'VERIFIED' && !correctionReason) {
    throw new AppError('VALIDATION_ERROR', 'A reason is required to correct a verified report.');
  }
  const inv = await prisma.investigation.findUniqueOrThrow({ where: { id: order.investigationId } });
  const params = (inv.parameters as unknown as CatalogParameter[]) ?? [];
  const errors: string[] = [];
  for (const r of results) {
    const def = params.find((x) => x.code === r.parameterCode);
    if (!def) errors.push(`Unknown parameter ${r.parameterCode}`);
    if (r.valueNumeric === undefined && !r.valueText) errors.push(`${r.parameterCode}: enter a value`);
    if (r.valueNumeric !== undefined && !Number.isFinite(r.valueNumeric)) errors.push(`${r.parameterCode}: invalid number`);
  }
  if (errors.length) throw new AppError('VALIDATION_ERROR', errors[0] ?? 'Invalid results', errors.map((m) => ({ path: 'results', message: m })));

  await prisma.$transaction(async (tx) => {
    for (const r of results) {
      const def = params.find((x) => x.code === r.parameterCode) as CatalogParameter;
      const prev = await tx.investigationResult.findFirst({ where: { orderId, parameterCode: r.parameterCode, status: 'ACTIVE' } });
      if (prev) await tx.investigationResult.update({ where: { id: prev.id }, data: { status: 'CORRECTED' } });
      const refLow = r.refLow ?? def.refLow ?? null;
      const refHigh = r.refHigh ?? def.refHigh ?? null;
      const value = r.valueNumeric ?? null;
      await tx.investigationResult.create({
        data: {
          orderId,
          parameterCode: def.code,
          parameterName: def.name,
          valueNumeric: value,
          valueText: r.valueText ?? null,
          unit: r.unit ?? def.unit ?? null,
          refLow,
          refHigh,
          refText: r.refText ?? def.refText ?? null,
          abnormalFlag: r.abnormal ? 'ABNORMAL' : computeAbnormalFlag(value, refLow, refHigh),
          correctsId: prev?.id ?? null,
          enteredById: p.userId,
        },
      });
    }
    await tx.investigationOrder.update({ where: { id: orderId }, data: { status: 'COMPLETED', completedAt: new Date(), ...(order.status === 'VERIFIED' ? { verifiedAt: null, verifiedById: null } : {}) } });
    await tx.labReport.upsert({ where: { orderId }, update: { verifiedAt: null, verifiedById: null }, create: { orderId } });
    await audit({ actor: p, action: order.status === 'VERIFIED' || order.status === 'COMPLETED' ? 'lab_result.modify' : 'lab_result.enter', resourceType: 'InvestigationOrder', resourceId: orderId, reason: correctionReason ?? null, after: { parameters: results.map((r) => r.parameterCode) } }, tx);
  });
  return prisma.investigationOrder.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
}

export async function attachReport(p: Principal, orderId: string, file: IncomingFile | undefined, summary?: string) {
  const order = await loadOrderForLab(p, orderId);
  const { filename, mimeType } = await validateUpload(file);
  const inv = await prisma.investigation.findUniqueOrThrow({ where: { id: order.investigationId } });
  const doc = await storeGeneratedDocument({
    patientId: order.patientId,
    encounterId: order.encounterId,
    type: inv.category === 'IMAGING' ? 'IMAGING_REPORT' : 'LAB_REPORT',
    title: `${inv.name} report (${order.orderNumber})`,
    filename,
    mimeType,
    body: (file as IncomingFile).buffer,
    uploadedById: p.userId,
  });
  await prisma.labReport.upsert({ where: { orderId }, update: { documentId: doc.id, summary: summary ?? undefined }, create: { orderId, documentId: doc.id, summary: summary ?? null } });
  await audit({ actor: p, action: 'lab_report.upload', resourceType: 'InvestigationOrder', resourceId: orderId, after: { documentId: doc.id } });
  return prisma.investigationOrder.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
}

export async function releaseToPatient(p: Principal | null, orderId: string) {
  const order = await prisma.investigationOrder.update({ where: { id: orderId }, data: { releasedToPatientAt: new Date() } });
  await audit({ actor: p, action: 'lab_report.release', resourceType: 'InvestigationOrder', resourceId: orderId });
  const link = await createSecureLink({ purpose: 'LAB_REPORT_VIEW', resourceType: 'InvestigationOrder', resourceId: orderId, patientId: order.patientId });
  await notify({ patientId: order.patientId, templateKey: 'LAB_REPORT_READY', variables: { link }, dedupeKey: `LAB_REPORT_READY:${orderId}:${order.verifiedAt?.getTime() ?? 0}`, actor: p }).catch(() => undefined);
}

export async function verify(p: Principal, orderId: string) {
  if (!hasPermission(p, 'investigation:verify')) throw new AppError('FORBIDDEN', 'You cannot verify reports.');
  const order = await loadOrderForLab(p, orderId);
  if (order.status !== 'COMPLETED') throw invalidTransition(order.status, 'VERIFIED');
  const results = await prisma.investigationResult.count({ where: { orderId, status: 'ACTIVE' } });
  if (!results) throw new AppError('UNPROCESSABLE', 'Enter results before verifying.');
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.investigationOrder.update({ where: { id: orderId }, data: { status: 'VERIFIED', verifiedAt: now, verifiedById: p.userId } });
    await tx.labReport.upsert({ where: { orderId }, update: { verifiedAt: now, verifiedById: p.userId }, create: { orderId, verifiedAt: now, verifiedById: p.userId } });
    await audit({ actor: p, action: 'lab_report.verify', resourceType: 'InvestigationOrder', resourceId: orderId }, tx);
  });
  const settings = await getOrgSettings(p.organizationId as string);
  if (settings.autoReleaseLabReports) await releaseToPatient(p, orderId);
  return prisma.investigationOrder.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
}

export async function addDoctorComment(p: Principal, orderId: string, comment: string) {
  const order = await prisma.investigationOrder.findUnique({ where: { id: orderId } });
  if (!order) throw notFound('Order');
  if (!hasPermission(p, 'clinical:write')) throw new AppError('FORBIDDEN', 'Only clinicians can comment on results.');
  await assertPatientAccess(p, order.patientId, 'clinical');
  await prisma.investigationOrder.update({ where: { id: orderId }, data: { doctorComment: comment } });
  await audit({ actor: p, action: 'investigation.comment', resourceType: 'InvestigationOrder', resourceId: orderId });
  return prisma.investigationOrder.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
}

export async function listForPatient(p: Principal, patientId: string) {
  const portal = await portalPatientIds(p, 'clinical');
  const isPortal = portal.includes(patientId);
  if (!isPortal) await assertPatientAccess(p, patientId, 'clinical');
  return prisma.investigationOrder.findMany({
    where: { patientId, ...(isPortal ? { releasedToPatientAt: { not: null } } : {}) },
    include: orderInclude,
    orderBy: { createdAt: 'desc' },
  });
}

/** Numeric trend for one parameter (e.g. HGB). Display only — no interpretation. */
export async function parameterTrend(p: Principal, patientId: string, parameterCode: string) {
  const portal = await portalPatientIds(p, 'clinical');
  const isPortal = portal.includes(patientId);
  if (!isPortal) await assertPatientAccess(p, patientId, 'clinical');
  const rows = await prisma.investigationResult.findMany({
    where: { parameterCode, status: 'ACTIVE', valueNumeric: { not: null }, order: { patientId, status: 'VERIFIED', ...(isPortal ? { releasedToPatientAt: { not: null } } : {}) } },
    include: { order: { select: { verifiedAt: true, collectedAt: true, orderNumber: true } } },
    orderBy: { enteredAt: 'asc' },
  });
  return rows.map((r) => ({
    date: (r.order.collectedAt ?? r.order.verifiedAt ?? r.enteredAt).toISOString(),
    value: Number(r.valueNumeric),
    unit: r.unit,
    refLow: r.refLow !== null ? Number(r.refLow) : null,
    refHigh: r.refHigh !== null ? Number(r.refHigh) : null,
    flag: r.abnormalFlag,
    orderNumber: r.order.orderNumber,
  }));
}
