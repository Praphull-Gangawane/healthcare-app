import type { Prisma } from '../generated/prisma/client.js';
import { prisma, type Tx } from '../lib/prisma.js';
import { AppError, notFound } from '../lib/errors.js';
import { nextNumber } from '../lib/ids.js';
import { canonicalJson, sha256 } from '../lib/crypto.js';
import { ageInYears, localDate } from '../lib/time.js';
import { logger } from '../lib/logger.js';
import { providers } from '../providers/index.js';
import { audit } from './audit.service.js';
import { loadEncounter } from './encounter.service.js';
import { assertPatientAccess, portalPatientIds } from './access/patientAccess.js';
import { getOrgSettings } from './orgSettings.js';
import { storeGeneratedDocument } from './document.service.js';
import { notify } from './notifications/notification.service.js';
import { createSecureLink } from './secureLink.service.js';
import { renderPrescriptionPdf, type PrescriptionSnapshot } from './pdf/prescriptionPdf.js';
import { hasPermission, type Principal } from './auth/principal.js';

export interface ItemInput {
  medicationId?: string | undefined;
  medicineName: string;
  strength?: string | undefined;
  dose: string;
  route: string;
  frequency: string;
  timing?: string | undefined;
  durationDays: number;
  quantity?: string | undefined;
  instructions?: string | undefined;
  refills?: number | undefined;
}

const itemData = (it: ItemInput, sortOrder: number) => ({
  medicationId: it.medicationId ?? null,
  medicineName: it.medicineName,
  strength: it.strength ?? null,
  dose: it.dose,
  route: it.route,
  frequency: it.frequency,
  timing: it.timing ?? null,
  durationDays: it.durationDays,
  quantity: it.quantity ?? null,
  instructions: it.instructions ?? null,
  refills: it.refills ?? 0,
  sortOrder,
});

export async function searchMedications(q: string, limit = 20) {
  return prisma.medication.findMany({
    where: { isActive: true, genericName: { contains: q, mode: 'insensitive' } },
    orderBy: [{ genericName: 'asc' }, { strength: 'asc' }],
    take: limit,
  });
}

async function loadRx(p: Principal, prescriptionId: string, mode: 'write' | 'read') {
  const rx = await prisma.prescription.findUnique({ where: { id: prescriptionId } });
  if (!rx) throw notFound('Prescription');
  if (mode === 'write') {
    if (!p.doctorId || rx.doctorId !== p.doctorId || !hasPermission(p, 'prescription:write')) {
      throw new AppError('FORBIDDEN', 'Only the prescribing doctor can change this prescription.');
    }
  }
  return rx;
}

function assertDraft(rx: { status: string }) {
  if (rx.status !== 'DRAFT') {
    throw new AppError('PRESCRIPTION_FINALIZED', 'This prescription is finalized and cannot be edited. Create an amendment instead.');
  }
}

async function allergyWarnings(patientId: string, items: { medicineName: string }[]) {
  const allergies = await prisma.allergy.findMany({ where: { patientId, status: 'ACTIVE' }, select: { substance: true } });
  const warnings: string[] = [];
  for (const it of items) {
    for (const a of allergies) {
      const s = a.substance.toLowerCase();
      if (s.length >= 3 && (it.medicineName.toLowerCase().includes(s) || s.includes(it.medicineName.toLowerCase()))) {
        warnings.push(`${it.medicineName} may match recorded allergy "${a.substance}". Please review.`);
      }
    }
  }
  return warnings;
}

export async function getDraftView(rxId: string) {
  const rx = await prisma.prescription.findUniqueOrThrow({
    where: { id: rxId },
    include: { items: { orderBy: { sortOrder: 'asc' } }, versions: { select: { versionNumber: true, createdAt: true, amendmentReason: true, documentId: true, contentHash: true }, orderBy: { versionNumber: 'asc' } } },
  });
  return { ...rx, warnings: await allergyWarnings(rx.patientId, rx.items) };
}

/** Returns the encounter's existing draft or creates one. */
export async function createDraft(p: Principal, encounterId: string) {
  const enc = await loadEncounter(p, encounterId, 'write');
  if (!hasPermission(p, 'prescription:write')) throw new AppError('FORBIDDEN', 'You cannot create prescriptions.');
  const existing = await prisma.prescription.findFirst({ where: { encounterId, status: 'DRAFT' } });
  if (existing) return getDraftView(existing.id);
  const rx = await prisma.$transaction(async (tx) => {
    const created = await tx.prescription.create({
      data: { prescriptionNumber: await nextNumber(tx, 'RX'), patientId: enc.patientId, doctorId: enc.doctorId, encounterId, followUpDate: enc.followUpDate },
    });
    await audit({ actor: p, action: 'prescription.create', resourceType: 'Prescription', resourceId: created.id, after: { encounterId } }, tx);
    return created;
  });
  return getDraftView(rx.id);
}

export async function updateDraft(p: Principal, rxId: string, input: { advice?: string | undefined; followUpDate?: string | null | undefined; investigationNotes?: string | undefined; items?: ItemInput[] | undefined }) {
  const rx = await loadRx(p, rxId, 'write');
  assertDraft(rx);
  await prisma.$transaction(async (tx) => {
    await tx.prescription.update({
      where: { id: rxId },
      data: {
        ...(input.advice !== undefined ? { advice: input.advice } : {}),
        ...(input.investigationNotes !== undefined ? { investigationNotes: input.investigationNotes } : {}),
        ...(input.followUpDate !== undefined ? { followUpDate: input.followUpDate ? new Date(`${input.followUpDate}T00:00:00Z`) : null } : {}),
      },
    });
    if (input.items) {
      await tx.prescriptionItem.deleteMany({ where: { prescriptionId: rxId } });
      if (input.items.length) await tx.prescriptionItem.createMany({ data: input.items.map((it, i) => ({ prescriptionId: rxId, ...itemData(it, i) })) });
    }
    await audit({ actor: p, action: 'prescription.update_draft', resourceType: 'Prescription', resourceId: rxId, after: { itemCount: input.items?.length } }, tx);
  });
  return getDraftView(rxId);
}

export async function addItem(p: Principal, rxId: string, item: ItemInput) {
  const rx = await loadRx(p, rxId, 'write');
  assertDraft(rx);
  const count = await prisma.prescriptionItem.count({ where: { prescriptionId: rxId } });
  await prisma.prescriptionItem.create({ data: { prescriptionId: rxId, ...itemData(item, count) } });
  await audit({ actor: p, action: 'prescription.item_add', resourceType: 'Prescription', resourceId: rxId });
  return getDraftView(rxId);
}

export async function updateItem(p: Principal, rxId: string, itemId: string, patch: Partial<ItemInput>) {
  const rx = await loadRx(p, rxId, 'write');
  assertDraft(rx);
  const res = await prisma.prescriptionItem.updateMany({
    where: { id: itemId, prescriptionId: rxId },
    data: Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
  });
  if (!res.count) throw notFound('Prescription item');
  await audit({ actor: p, action: 'prescription.item_update', resourceType: 'Prescription', resourceId: rxId, after: { itemId, fields: Object.keys(patch) } });
  return getDraftView(rxId);
}

export async function removeItem(p: Principal, rxId: string, itemId: string) {
  const rx = await loadRx(p, rxId, 'write');
  assertDraft(rx);
  const res = await prisma.prescriptionItem.deleteMany({ where: { id: itemId, prescriptionId: rxId } });
  if (!res.count) throw notFound('Prescription item');
  const rest = await prisma.prescriptionItem.findMany({ where: { prescriptionId: rxId }, orderBy: { sortOrder: 'asc' } });
  await prisma.$transaction(rest.map((r, i) => prisma.prescriptionItem.update({ where: { id: r.id }, data: { sortOrder: i } })));
  await audit({ actor: p, action: 'prescription.item_remove', resourceType: 'Prescription', resourceId: rxId, after: { itemId } });
  return getDraftView(rxId);
}

export async function reorderItems(p: Principal, rxId: string, itemIds: string[]) {
  const rx = await loadRx(p, rxId, 'write');
  assertDraft(rx);
  const items = await prisma.prescriptionItem.findMany({ where: { prescriptionId: rxId } });
  if (items.length !== itemIds.length || !items.every((i) => itemIds.includes(i.id))) {
    throw new AppError('VALIDATION_ERROR', 'Reorder must include every item exactly once.');
  }
  await prisma.$transaction(itemIds.map((id, i) => prisma.prescriptionItem.update({ where: { id }, data: { sortOrder: i } })));
  return getDraftView(rxId);
}

async function buildSnapshot(tx: Tx, rxId: string, version: number, items: ItemInput[], extra: { advice: string | null; followUpDate: Date | null; investigationNotes: string | null; amendmentReason: string | null }) {
  const rx = await tx.prescription.findUniqueOrThrow({
    where: { id: rxId },
    include: {
      patient: { include: { allergies: { where: { status: 'ACTIVE' } } } },
      doctor: true,
      encounter: { include: { facility: { include: { address: true } }, diagnoses: { where: { status: 'ACTIVE' } }, orders: { where: { status: { not: 'CANCELLED' } }, include: { investigation: true } } } },
    },
  });
  const f = rx.encounter.facility;
  const settings = await getOrgSettings(rx.patient.organizationId, tx);
  const snapshot: PrescriptionSnapshot = {
    prescriptionNumber: rx.prescriptionNumber,
    version,
    issuedAt: localDate(new Date(), f.timezone),
    amendmentReason: extra.amendmentReason,
    facility: {
      name: f.name,
      address: f.address ? [f.address.line1, f.address.line2, f.address.city, f.address.state, f.address.postalCode].filter(Boolean).join(', ') : null,
      phone: f.phone,
      registrationNo: f.registrationNo,
    },
    doctor: { name: rx.doctor.displayName, qualifications: rx.doctor.qualifications, specialty: rx.doctor.specialty, registrationNumber: rx.doctor.registrationNumber, registrationCouncil: rx.doctor.registrationCouncil },
    patient: { name: rx.patient.fullName, uhid: rx.patient.uhid, age: ageInYears(rx.patient.dateOfBirth), gender: rx.patient.gender },
    encounter: { number: rx.encounter.encounterNumber, date: localDate(rx.encounter.startedAt, f.timezone) },
    diagnoses: rx.encounter.diagnoses.map((d) => `${d.description}${d.code ? ` (${d.code})` : ''}${d.type === 'PROVISIONAL' ? ' — provisional' : ''}`),
    allergies: rx.patient.allergies.map((a) => a.substance),
    items: items.map((it) => ({ medicineName: it.medicineName, strength: it.strength ?? null, dose: it.dose, route: it.route, frequency: it.frequency, timing: it.timing ?? null, durationDays: it.durationDays, quantity: it.quantity ?? null, instructions: it.instructions ?? null, refills: it.refills ?? 0 })),
    advice: extra.advice,
    investigations: rx.encounter.orders.map((o) => o.investigation.name),
    investigationNotes: extra.investigationNotes,
    followUpDate: extra.followUpDate ? extra.followUpDate.toISOString().slice(0, 10) : null,
    signature: { method: '', ref: '', statement: '' },
    footer: settings.prescriptionFooter,
  };
  return { snapshot, rx };
}

async function writeVersion(p: Principal, rxId: string, items: ItemInput[], extra: { advice: string | null; followUpDate: Date | null; investigationNotes: string | null; amendmentReason: string | null }, nextStatus: 'FINALIZED' | 'AMENDED') {
  if (!items.length) throw new AppError('VALIDATION_ERROR', 'Add at least one medicine before finalizing.');
  return prisma.$transaction(async (tx) => {
    const current = await tx.prescription.findUniqueOrThrow({ where: { id: rxId } });
    const version = current.currentVersion + 1;
    const { snapshot } = await buildSnapshot(tx, rxId, version, items, extra);
    const unsigned = { ...snapshot, signature: undefined };
    const contentHash = sha256(canonicalJson(unsigned));
    const sig = await providers.signing.sign({ prescriptionId: rxId, versionNumber: version, contentHash, signerUserId: p.userId, sessionId: p.sessionId });
    snapshot.signature = { method: sig.method, ref: sig.signatureRef, statement: sig.statement };
    snapshot.contentHash = contentHash;
    // Guard against concurrent finalize: only advance from the version we read.
    const upd = await tx.prescription.updateMany({
      where: { id: rxId, currentVersion: current.currentVersion },
      data: { status: nextStatus, currentVersion: version, finalizedAt: current.finalizedAt ?? new Date(), advice: extra.advice, followUpDate: extra.followUpDate, investigationNotes: extra.investigationNotes },
    });
    if (!upd.count) throw new AppError('PRESCRIPTION_FINALIZED', 'This prescription was already finalized.');
    const v = await tx.prescriptionVersion.create({
      data: {
        prescriptionId: rxId,
        versionNumber: version,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        contentHash,
        amendmentReason: extra.amendmentReason,
        signedById: p.userId,
        signatureMethod: sig.method,
        signatureRef: sig.signatureRef,
      },
    });
    await audit({ actor: p, action: nextStatus === 'FINALIZED' ? 'prescription.finalize' : 'prescription.amend', resourceType: 'Prescription', resourceId: rxId, reason: extra.amendmentReason, after: { version, contentHash } }, tx);
    return { version: v, snapshot, patientId: current.patientId };
  });
}

async function afterVersion(p: Principal, rxId: string, out: { version: { id: string; versionNumber: number; contentHash: string }; snapshot: PrescriptionSnapshot; patientId: string }) {
  try {
    const pdf = await renderPrescriptionPdf(out.snapshot, out.version.contentHash);
    const docRow = await storeGeneratedDocument({
      patientId: out.patientId,
      type: 'PRESCRIPTION',
      title: `Prescription ${out.snapshot.prescriptionNumber} v${out.version.versionNumber}`,
      filename: `${out.snapshot.prescriptionNumber}-v${out.version.versionNumber}.pdf`,
      mimeType: 'application/pdf',
      body: pdf,
      uploadedById: p.userId,
    });
    await prisma.prescriptionVersion.update({ where: { id: out.version.id }, data: { documentId: docRow.id } });
  } catch (err) {
    logger.error({ err, prescriptionId: rxId }, 'prescription PDF generation failed');
  }
  const link = await createSecureLink({ purpose: 'PRESCRIPTION_VIEW', resourceType: 'Prescription', resourceId: rxId, patientId: out.patientId });
  await notify({ patientId: out.patientId, templateKey: 'PRESCRIPTION_READY', variables: { link }, dedupeKey: `PRESCRIPTION_READY:${rxId}:v${out.version.versionNumber}`, actor: p }).catch(() => undefined);
}

export async function finalize(p: Principal, rxId: string) {
  const rx = await loadRx(p, rxId, 'write');
  if (!hasPermission(p, 'prescription:finalize')) throw new AppError('FORBIDDEN', 'You cannot finalize prescriptions.');
  assertDraft(rx);
  const items = await prisma.prescriptionItem.findMany({ where: { prescriptionId: rxId }, orderBy: { sortOrder: 'asc' } });
  const out = await writeVersion(
    p,
    rxId,
    items.map((i) => ({ ...i, medicationId: i.medicationId ?? undefined, strength: i.strength ?? undefined, timing: i.timing ?? undefined, quantity: i.quantity ?? undefined, instructions: i.instructions ?? undefined })),
    { advice: rx.advice, followUpDate: rx.followUpDate, investigationNotes: rx.investigationNotes, amendmentReason: null },
    'FINALIZED',
  );
  await afterVersion(p, rxId, out);
  return getPrescription(p, rxId);
}

/** Changes after finalization create a new immutable version with a mandatory reason. */
export async function amend(p: Principal, rxId: string, input: { reason: string; items: ItemInput[]; advice?: string | undefined; followUpDate?: string | null | undefined; investigationNotes?: string | undefined }) {
  const rx = await loadRx(p, rxId, 'write');
  if (!hasPermission(p, 'prescription:finalize')) throw new AppError('FORBIDDEN', 'You cannot amend prescriptions.');
  if (rx.status !== 'FINALIZED' && rx.status !== 'AMENDED') throw new AppError('INVALID_STATE_TRANSITION', 'Only finalized prescriptions can be amended.');
  const out = await writeVersion(
    p,
    rxId,
    input.items,
    {
      advice: input.advice ?? rx.advice,
      followUpDate: input.followUpDate === undefined ? rx.followUpDate : input.followUpDate ? new Date(`${input.followUpDate}T00:00:00Z`) : null,
      investigationNotes: input.investigationNotes ?? rx.investigationNotes,
      amendmentReason: input.reason,
    },
    'AMENDED',
  );
  await prisma.$transaction([
    prisma.prescriptionItem.deleteMany({ where: { prescriptionId: rxId } }),
    prisma.prescriptionItem.createMany({ data: input.items.map((it, i) => ({ prescriptionId: rxId, ...itemData(it, i) })) }),
  ]);
  await afterVersion(p, rxId, out);
  return getPrescription(p, rxId);
}

export async function discardDraft(p: Principal, rxId: string) {
  const rx = await loadRx(p, rxId, 'write');
  assertDraft(rx);
  await prisma.prescription.update({ where: { id: rxId }, data: { status: 'CANCELLED' } });
  await audit({ actor: p, action: 'prescription.discard_draft', resourceType: 'Prescription', resourceId: rxId });
}

/**
 * Read access: patient/proxy (finalized only), clinicians with clinical access, pharmacists
 * (finalized, dispensing view). Drafts are visible only to the prescribing doctor.
 */
export async function getPrescription(p: Principal, rxId: string) {
  const rx = await prisma.prescription.findUnique({
    where: { id: rxId },
    include: {
      versions: { orderBy: { versionNumber: 'asc' }, select: { id: true, versionNumber: true, createdAt: true, amendmentReason: true, contentHash: true, documentId: true, signatureMethod: true, signatureRef: true, snapshot: true } },
      doctor: { select: { id: true, displayName: true, specialty: true } },
      items: { orderBy: { sortOrder: 'asc' } },
    },
  });
  if (!rx) throw notFound('Prescription');
  const isDraft = rx.status === 'DRAFT' || rx.status === 'CANCELLED';
  if (isDraft) {
    if (p.doctorId !== rx.doctorId) throw notFound('Prescription');
    return { ...rx, warnings: await allergyWarnings(rx.patientId, rx.items) };
  }
  const portal = await portalPatientIds(p, 'clinical');
  if (!portal.includes(rx.patientId)) {
    if (hasPermission(p, 'prescription:dispense_read') && p.organizationId) {
      const patient = await prisma.patient.findUnique({ where: { id: rx.patientId }, select: { organizationId: true } });
      if (patient?.organizationId !== p.organizationId) throw notFound('Prescription');
      await audit({ actor: p, action: 'prescription.dispense_view', resourceType: 'Prescription', resourceId: rx.id });
    } else if (hasPermission(p, 'prescription:read')) {
      await assertPatientAccess(p, rx.patientId, 'clinical');
    } else {
      throw new AppError('FORBIDDEN', 'You do not have access to this prescription.');
    }
  }
  const current = rx.versions.at(-1);
  await audit({ actor: p, action: 'prescription.view', resourceType: 'Prescription', resourceId: rx.id });
  return { ...rx, items: undefined, current, warnings: [] as string[] };
}

export async function listForPatient(p: Principal, patientId: string) {
  const portal = await portalPatientIds(p, 'clinical');
  const isPortal = portal.includes(patientId);
  if (!isPortal) await assertPatientAccess(p, patientId, 'clinical');
  const rows = await prisma.prescription.findMany({
    where: { patientId, status: isPortal ? { in: ['FINALIZED', 'AMENDED'] } : { not: 'CANCELLED' } },
    orderBy: { createdAt: 'desc' },
    include: {
      doctor: { select: { displayName: true, specialty: true } },
      encounter: { select: { id: true, encounterNumber: true, startedAt: true } },
      versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { versionNumber: true, snapshot: true, documentId: true, createdAt: true } },
    },
  });
  return rows
    .filter((r) => isPortal || r.status !== 'DRAFT' || r.doctorId === p.doctorId)
    .map((r) => {
      const snap = r.versions[0]?.snapshot as unknown as PrescriptionSnapshot | undefined;
      return {
        id: r.id,
        prescriptionNumber: r.prescriptionNumber,
        status: r.status,
        createdAt: r.createdAt,
        finalizedAt: r.finalizedAt,
        currentVersion: r.currentVersion,
        doctor: r.doctor,
        encounter: r.encounter,
        followUpDate: r.followUpDate,
        documentId: r.versions[0]?.documentId ?? null,
        items: snap?.items ?? [],
      };
    });
}
