import type { DiagnosisType, CodeSystem, NoteType, Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { AppError, notFound } from '../lib/errors.js';
import { nextNumber } from '../lib/ids.js';
import { dateOnly } from '../lib/time.js';
import { audit } from './audit.service.js';
import { transition } from './appointment.service.js';
import { syncTokenForAppointment } from './queue.service.js';
import { assertPatientAccess } from './access/patientAccess.js';
import { notify } from './notifications/notification.service.js';
import type { Principal } from './auth/principal.js';

export const encounterInclude = {
  patient: { select: { id: true, uhid: true, fullName: true, dateOfBirth: true, gender: true, bloodGroup: true } },
  doctor: { select: { id: true, displayName: true, specialty: true, registrationNumber: true } },
  appointment: { select: { id: true, appointmentNumber: true, type: true, startAt: true, reason: true, intake: true } },
  notes: { orderBy: { createdAt: 'asc' } },
  vitals: { where: { status: 'ACTIVE' }, orderBy: { measuredAt: 'desc' } },
  diagnoses: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } },
  prescriptions: { select: { id: true, prescriptionNumber: true, status: true, currentVersion: true, updatedAt: true } },
  orders: { include: { investigation: { select: { code: true, name: true, category: true } } }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.EncounterInclude;

function requireDoctor(p: Principal): string {
  if (!p.doctorId || !p.permissions.has('encounter:write')) throw new AppError('FORBIDDEN', 'Only doctors can document consultations.');
  return p.doctorId;
}

/** Loads an encounter the doctor authored (writes) or that the principal may read clinically. */
export async function loadEncounter(p: Principal, encounterId: string, mode: 'read' | 'write') {
  const enc = await prisma.encounter.findUnique({ where: { id: encounterId } });
  if (!enc) throw notFound('Encounter');
  if (mode === 'write') {
    if (requireDoctor(p) !== enc.doctorId) throw new AppError('FORBIDDEN', 'Only the treating doctor can edit this consultation.');
    return enc;
  }
  await assertPatientAccess(p, enc.patientId, 'clinical');
  return enc;
}

export async function startFromAppointment(p: Principal, appointmentId: string) {
  const doctorId = requireDoctor(p);
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId }, include: { encounter: true } });
  if (!appt || appt.doctorId !== doctorId) throw notFound('Appointment');
  if (appt.encounter) return getEncounter(p, appt.encounter.id);
  const allowed = appt.type === 'TELECONSULTATION' ? ['CONFIRMED', 'CHECKED_IN', 'WAITING'] : ['CHECKED_IN', 'WAITING'];
  if (!allowed.includes(appt.status)) {
    throw new AppError('INVALID_STATE_TRANSITION', 'Check the patient in before starting the consultation.');
  }
  const encounter = await prisma.$transaction(async (tx) => {
    const intake = await tx.patientIntake.findUnique({ where: { appointmentId: appt.id } });
    const enc = await tx.encounter.create({
      data: {
        encounterNumber: await nextNumber(tx, 'ENC'),
        appointmentId: appt.id,
        patientId: appt.patientId,
        doctorId,
        facilityId: appt.facilityId,
        chiefComplaint: intake?.chiefComplaint ?? appt.reason ?? null,
      },
    });
    await transition(tx, appt, 'IN_CONSULTATION', p.userId);
    await syncTokenForAppointment(tx, appt.id, 'IN_CONSULTATION');
    await audit({ actor: p, action: 'encounter.start', resourceType: 'Encounter', resourceId: enc.id, after: { appointmentId: appt.id } }, tx);
    return enc;
  });
  return getEncounter(p, encounter.id);
}

export async function getEncounter(p: Principal, encounterId: string) {
  await loadEncounter(p, encounterId, 'read');
  return prisma.encounter.findUniqueOrThrow({ where: { id: encounterId }, include: encounterInclude });
}

export interface SoapInput {
  version: number;
  chiefComplaint?: string | undefined;
  historyOfIllness?: string | undefined;
  examinationFindings?: string | undefined;
  assessmentNotes?: string | undefined;
  planNotes?: string | undefined;
  followUpDate?: string | null | undefined;
  followUpInstructions?: string | undefined;
}

/** Draft save with optimistic concurrency (version) — safe for autosave & reconnect retries. */
export async function saveDraft(p: Principal, encounterId: string, input: SoapInput) {
  const enc = await loadEncounter(p, encounterId, 'write');
  if (enc.status !== 'IN_PROGRESS') throw new AppError('INVALID_STATE_TRANSITION', 'This consultation is already completed. Add an addendum instead.');
  const { version, followUpDate, ...fields } = input;
  const res = await prisma.encounter.updateMany({
    where: { id: encounterId, version },
    data: {
      ...fields,
      ...(followUpDate !== undefined ? { followUpDate: followUpDate ? dateOnly(followUpDate) : null } : {}),
      version: { increment: 1 },
    },
  });
  if (!res.count) throw new AppError('STALE_VERSION', 'This consultation was updated elsewhere. Reload to see the latest version before saving.');
  await audit({ actor: p, action: 'encounter.save_draft', resourceType: 'Encounter', resourceId: encounterId, after: { fields: Object.keys(fields) } });
  return prisma.encounter.findUniqueOrThrow({ where: { id: encounterId }, include: encounterInclude });
}

export async function addNote(p: Principal, encounterId: string, input: { type: NoteType; content: string; isAiDraft?: boolean | undefined }) {
  const enc = await loadEncounter(p, encounterId, 'write');
  const isAddendum = enc.status === 'COMPLETED';
  if (enc.status === 'CANCELLED') throw new AppError('INVALID_STATE_TRANSITION', 'This consultation was cancelled.');
  if (isAddendum && input.isAiDraft) throw new AppError('UNPROCESSABLE', 'AI drafts cannot be added as addenda.');
  const note = await prisma.clinicalNote.create({
    data: {
      encounterId,
      authorId: p.userId,
      type: isAddendum ? 'ADDENDUM' : input.type,
      content: input.content,
      isAiDraft: input.isAiDraft ?? false,
      status: isAddendum ? 'FINAL' : 'DRAFT',
      finalizedAt: isAddendum ? new Date() : null,
    },
  });
  await audit({ actor: p, action: isAddendum ? 'note.addendum' : 'note.create', resourceType: 'ClinicalNote', resourceId: note.id, after: { encounterId, type: note.type, isAiDraft: note.isAiDraft } });
  return note;
}

/** AI-assisted drafts become part of the record only after explicit clinician approval. */
export async function approveAiDraft(p: Principal, noteId: string, editedContent?: string) {
  const note = await prisma.clinicalNote.findUnique({ where: { id: noteId } });
  if (!note) throw notFound('Note');
  await loadEncounter(p, note.encounterId, 'write');
  if (!note.isAiDraft || note.aiReviewedById) throw new AppError('INVALID_STATE_TRANSITION', 'This note is not an unreviewed AI draft.');
  const updated = await prisma.clinicalNote.update({ where: { id: noteId }, data: { aiReviewedById: p.userId, ...(editedContent ? { content: editedContent } : {}) } });
  await audit({ actor: p, action: 'note.ai_draft_approved', resourceType: 'ClinicalNote', resourceId: noteId });
  return updated;
}

export async function updateDraftNote(p: Principal, noteId: string, content: string) {
  const note = await prisma.clinicalNote.findUnique({ where: { id: noteId } });
  if (!note) throw notFound('Note');
  await loadEncounter(p, note.encounterId, 'write');
  if (note.status !== 'DRAFT') throw new AppError('INVALID_STATE_TRANSITION', 'Finalized notes cannot be edited. Add an addendum instead.');
  return prisma.clinicalNote.update({ where: { id: noteId }, data: { content } });
}

export async function addDiagnosis(p: Principal, encounterId: string, input: { description: string; code?: string | undefined; codeSystem: CodeSystem; type: DiagnosisType }) {
  const enc = await loadEncounter(p, encounterId, 'write');
  if (enc.status !== 'IN_PROGRESS') throw new AppError('INVALID_STATE_TRANSITION', 'Diagnoses can only be added during the consultation.');
  const dx = await prisma.diagnosis.create({
    data: { encounterId, patientId: enc.patientId, description: input.description, code: input.code ?? null, codeSystem: input.codeSystem, type: input.type, recordedById: p.userId },
  });
  await audit({ actor: p, action: 'diagnosis.create', resourceType: 'Diagnosis', resourceId: dx.id, after: { encounterId, type: dx.type } });
  return dx;
}

export async function removeDiagnosis(p: Principal, diagnosisId: string) {
  const dx = await prisma.diagnosis.findUnique({ where: { id: diagnosisId } });
  if (!dx) throw notFound('Diagnosis');
  const enc = await loadEncounter(p, dx.encounterId, 'write');
  if (enc.status !== 'IN_PROGRESS') throw new AppError('INVALID_STATE_TRANSITION', 'The consultation is completed.');
  await prisma.diagnosis.update({ where: { id: diagnosisId }, data: { status: 'ENTERED_IN_ERROR' } });
  await audit({ actor: p, action: 'diagnosis.entered_in_error', resourceType: 'Diagnosis', resourceId: diagnosisId });
}

/** Completes the visit: finalizes draft notes, closes appointment/token, schedules follow-up reminder. */
export async function complete(p: Principal, encounterId: string, input: { followUpDate?: string | undefined; followUpInstructions?: string | undefined }) {
  const enc = await loadEncounter(p, encounterId, 'write');
  if (enc.status !== 'IN_PROGRESS') throw new AppError('INVALID_STATE_TRANSITION', 'This consultation is already completed.');
  const drafts = await prisma.prescription.count({ where: { encounterId, status: 'DRAFT', items: { some: {} } } });
  if (drafts) throw new AppError('UNPROCESSABLE', 'Finalize or discard the draft prescription before completing the visit.');
  const unreviewedAi = await prisma.clinicalNote.count({ where: { encounterId, isAiDraft: true, aiReviewedById: null } });
  if (unreviewedAi) throw new AppError('UNPROCESSABLE', 'Review or delete AI-drafted notes before completing the visit.');

  await prisma.$transaction(async (tx) => {
    await tx.encounter.update({
      where: { id: encounterId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        ...(input.followUpDate ? { followUpDate: dateOnly(input.followUpDate) } : {}),
        ...(input.followUpInstructions ? { followUpInstructions: input.followUpInstructions } : {}),
      },
    });
    await tx.clinicalNote.updateMany({ where: { encounterId, status: 'DRAFT' }, data: { status: 'FINAL', finalizedAt: new Date() } });
    await tx.prescription.deleteMany({ where: { encounterId, status: 'DRAFT', items: { none: {} } } });
    if (enc.appointmentId) {
      const appt = await tx.appointment.findUniqueOrThrow({ where: { id: enc.appointmentId } });
      if (appt.status === 'IN_CONSULTATION') await transition(tx, appt, 'COMPLETED', p.userId);
      await syncTokenForAppointment(tx, appt.id, 'COMPLETED');
    }
    await audit({ actor: p, action: 'encounter.complete', resourceType: 'Encounter', resourceId: encounterId, after: { followUpDate: input.followUpDate ?? null } }, tx);
  });
  const done = await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } });
  if (done.followUpDate) {
    await notify({
      patientId: done.patientId,
      templateKey: 'FOLLOW_UP_REMINDER',
      variables: { date: done.followUpDate.toISOString().slice(0, 10) },
      dedupeKey: `FOLLOW_UP_REMINDER:${done.id}`,
      actor: p,
    }).catch(() => undefined);
  }
  return prisma.encounter.findUniqueOrThrow({ where: { id: encounterId }, include: encounterInclude });
}
