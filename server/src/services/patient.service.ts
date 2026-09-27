import type { Prisma } from '../generated/prisma/client.js';
import type { z } from 'zod';
import { prisma, type Tx } from '../lib/prisma.js';
import { AppError, notFound } from '../lib/errors.js';
import { nextUhid } from '../lib/ids.js';
import { ageInYears, dateOnly } from '../lib/time.js';
import { audit, type AuditActor } from './audit.service.js';
import { demographicSelect, findDuplicateCandidates, normalizeName } from '../repositories/patient.repository.js';
import type { createPatientSchema, addDependentSchema, updatePatientSchema, medicalProfileSchema } from '../validators/patient.schemas.js';
import type { ConsentSource } from '../generated/prisma/client.js';

type CreatePatientInput = z.infer<typeof createPatientSchema>;
type MedicalProfileInput = z.infer<typeof medicalProfileSchema>;

export const MINOR_AGE_YEARS = 18;

const maskMobile = (m: string | null) => (m ? `${m.slice(0, 3)}******${m.slice(-2)}` : null);

async function writeMedicalProfile(tx: Tx, patientId: string, profile: MedicalProfileInput | undefined, actorId: string | null) {
  if (!profile) return;
  if (profile.allergies.length) {
    await tx.allergy.createMany({
      data: profile.allergies.map((a) => ({ patientId, substance: a.substance, reaction: a.reaction ?? null, severity: a.severity, recordedById: actorId })),
    });
  }
  const history: Prisma.MedicalHistoryEntryCreateManyInput[] = [
    ...profile.conditions.map((d) => ({ patientId, type: 'CONDITION' as const, description: d, recordedById: actorId })),
    ...profile.currentMedications.map((d) => ({ patientId, type: 'CURRENT_MEDICATION' as const, description: d, recordedById: actorId })),
    ...profile.surgeries.map((d) => ({ patientId, type: 'SURGERY' as const, description: d, recordedById: actorId })),
    ...profile.familyHistory.map((d) => ({ patientId, type: 'FAMILY_HISTORY' as const, description: d, recordedById: actorId })),
    ...(profile.notes ? [{ patientId, type: 'NOTE' as const, description: profile.notes, recordedById: actorId }] : []),
  ];
  if (history.length) await tx.medicalHistoryEntry.createMany({ data: history });
}

export interface CreateContext {
  organizationId: string;
  actor: AuditActor | null;
  source: ConsentSource;
  userId?: string | null;
  isStaff: boolean;
}

/** Creates a patient with UHID, contacts, medical profile and explicit channel consents. */
export async function createPatient(input: Omit<CreatePatientInput, 'confirmNotDuplicate'> & { confirmNotDuplicate?: boolean | undefined }, ctx: CreateContext, db?: Tx) {
  const fullName = [input.firstName, input.lastName].filter(Boolean).join(' ');
  const run = async (tx: Tx) => {
    const dupes = await findDuplicateCandidates(
      { organizationId: ctx.organizationId, fullName, dateOfBirth: input.dateOfBirth, mobile: input.mobile, email: input.email },
      tx,
    );
    if (dupes.length && !(ctx.isStaff && input.confirmNotDuplicate)) {
      throw new AppError(
        'PATIENT_POSSIBLE_DUPLICATE',
        ctx.isStaff
          ? 'A patient with matching details may already exist. Review the matches or confirm this is a new patient.'
          : 'We may already have a record for you. Please contact the reception desk so we can link your account safely.',
        ctx.isStaff ? { candidates: dupes.map((d) => ({ ...d, mobile: maskMobile(d.mobile) })) } : undefined,
      );
    }
    const org = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } });
    const uhid = await nextUhid(tx, org);
    const address = input.address ? await tx.address.create({ data: { ...input.address, line2: input.address.line2 ?? null, postalCode: input.address.postalCode ?? null } }) : null;
    const patient = await tx.patient.create({
      data: {
        uhid,
        organizationId: ctx.organizationId,
        userId: ctx.userId ?? null,
        firstName: input.firstName,
        lastName: input.lastName ?? null,
        fullName,
        nameNormalized: normalizeName(fullName),
        dateOfBirth: dateOnly(input.dateOfBirth),
        gender: input.gender,
        mobile: input.mobile ?? null,
        email: input.email ?? null,
        addressId: address?.id ?? null,
        bloodGroup: input.medicalProfile?.bloodGroup ?? null,
        customFields: input.customFields ?? {},
        createdById: ctx.actor?.userId ?? null,
        contacts: input.emergencyContact ? { create: { ...input.emergencyContact, isEmergency: true } } : undefined,
      },
      select: demographicSelect,
    });
    await writeMedicalProfile(tx, patient.id, input.medicalProfile, ctx.actor?.userId ?? null);
    const consents = input.consents ?? { sms: false, whatsapp: false, email: false };
    await tx.notificationConsent.createMany({
      data: (
        [
          ['SMS', consents.sms],
          ['WHATSAPP', consents.whatsapp],
          ['EMAIL', consents.email],
        ] as const
      ).map(([channel, optedIn]) => ({
        patientId: patient.id,
        channel,
        optedIn,
        source: ctx.source,
        recordedById: ctx.actor?.userId ?? null,
        consentText: `Transactional ${channel} messages about appointments, prescriptions and reports`,
      })),
    });
    await audit(
      {
        actor: ctx.actor,
        action: dupes.length ? 'patient.create_confirmed_not_duplicate' : 'patient.create',
        resourceType: 'Patient',
        resourceId: patient.id,
        after: { uhid, source: ctx.source },
      },
      tx,
    );
    return patient;
  };
  return db ? run(db) : prisma.$transaction(run);
}

export async function getDemographics(patientId: string) {
  const p = await prisma.patient.findUnique({
    where: { id: patientId },
    select: {
      ...demographicSelect,
      customFields: true,
      address: true,
      contacts: { select: { id: true, name: true, relationship: true, phone: true, isEmergency: true } },
    },
  });
  if (!p) throw notFound('Patient');
  return { ...p, age: ageInYears(p.dateOfBirth), isMinor: ageInYears(p.dateOfBirth) < MINOR_AGE_YEARS };
}

export async function getMedicalProfile(patientId: string) {
  const [allergies, history, patient] = await Promise.all([
    prisma.allergy.findMany({ where: { patientId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } }),
    prisma.medicalHistoryEntry.findMany({ where: { patientId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } }),
    prisma.patient.findUnique({ where: { id: patientId }, select: { bloodGroup: true } }),
  ]);
  return { bloodGroup: patient?.bloodGroup ?? null, allergies, history };
}

type UpdateInput = z.infer<typeof updatePatientSchema>;

export async function updatePatient(patientId: string, input: UpdateInput, actor: AuditActor) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.patient.findUniqueOrThrow({ where: { id: patientId }, select: { ...demographicSelect, addressId: true } });
    const firstName = input.firstName ?? before.firstName;
    const lastName = input.lastName ?? before.lastName;
    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    let addressId = before.addressId;
    if (input.address) {
      const data = { ...input.address, line2: input.address.line2 ?? null, postalCode: input.address.postalCode ?? null };
      addressId = before.addressId
        ? (await tx.address.update({ where: { id: before.addressId }, data })).id
        : (await tx.address.create({ data })).id;
    }
    const after = await tx.patient.update({
      where: { id: patientId },
      data: {
        firstName,
        lastName,
        fullName,
        nameNormalized: normalizeName(fullName),
        ...(input.dateOfBirth ? { dateOfBirth: dateOnly(input.dateOfBirth) } : {}),
        ...(input.gender ? { gender: input.gender } : {}),
        ...(input.mobile !== undefined ? { mobile: input.mobile } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.bloodGroup ? { bloodGroup: input.bloodGroup } : {}),
        ...(input.customFields ? { customFields: input.customFields } : {}),
        addressId,
      },
      select: demographicSelect,
    });
    if (input.emergencyContact) {
      await tx.patientContact.deleteMany({ where: { patientId, isEmergency: true } });
      await tx.patientContact.create({ data: { patientId, ...input.emergencyContact, isEmergency: true } });
    }
    const changed = Object.keys(input).filter((k) => k !== 'address' && k !== 'emergencyContact');
    const pick = (o: Record<string, unknown>) => Object.fromEntries(changed.map((k) => [k, o[k] instanceof Date ? (o[k] as Date).toISOString().slice(0, 10) : o[k]]));
    await audit(
      { actor, action: 'patient.update', resourceType: 'Patient', resourceId: patientId, before: pick(before) as Prisma.InputJsonValue, after: pick(after) as Prisma.InputJsonValue },
      tx,
    );
    return after;
  });
}

type DependentInput = z.infer<typeof addDependentSchema>;

/**
 * Adds a dependent profile managed by the caregiver. Minors → ACTIVE guardian access.
 * Adults → PENDING until staff verify the adult's consent (no unrestricted adult-to-adult access).
 */
export async function addDependent(caregiverUserId: string, input: DependentInput, actor: AuditActor, organizationId: string) {
  const age = ageInYears(dateOnly(input.dateOfBirth));
  const isMinor = age < MINOR_AGE_YEARS;
  if (!isMinor && !input.adultConsentAttestation) {
    throw new AppError('CONSENT_REQUIRED', 'Adding an adult requires confirmation that they have agreed to you managing their care.');
  }
  return prisma.$transaction(async (tx) => {
    const patient = await createPatient(
      { ...input, consents: { sms: false, whatsapp: false, email: false } },
      { organizationId, actor, source: 'PORTAL', isStaff: false },
      tx,
    );
    const link = await tx.patientGuardian.create({
      data: {
        patientId: patient.id,
        proxyUserId: caregiverUserId,
        relationship: input.relationship,
        accessLevel: 'FULL',
        status: isMinor ? 'ACTIVE' : 'PENDING',
        consentedAt: isMinor ? new Date() : null,
        createdById: actor.userId,
      },
    });
    await audit({ actor, action: 'proxy.create', resourceType: 'PatientGuardian', resourceId: link.id, after: { patientId: patient.id, status: link.status, relationship: link.relationship } }, tx);
    return { patient, proxy: { id: link.id, status: link.status, relationship: link.relationship, isMinor } };
  });
}

export async function listDependents(userId: string) {
  const links = await prisma.patientGuardian.findMany({
    where: { proxyUserId: userId, status: { in: ['ACTIVE', 'PENDING'] } },
    include: { patient: { select: demographicSelect } },
    orderBy: { createdAt: 'asc' },
  });
  return links.map((l) => ({ proxyId: l.id, relationship: l.relationship, status: l.status, accessLevel: l.accessLevel, patient: l.patient }));
}

export async function setProxyStatus(proxyId: string, status: 'ACTIVE' | 'REVOKED', actor: AuditActor) {
  const before = await prisma.patientGuardian.findUnique({ where: { id: proxyId } });
  if (!before) throw notFound('Proxy relationship');
  const updated = await prisma.patientGuardian.update({
    where: { id: proxyId },
    data: status === 'ACTIVE' ? { status, consentedAt: new Date() } : { status, revokedAt: new Date() },
  });
  await audit({ actor, action: status === 'ACTIVE' ? 'proxy.activate' : 'proxy.revoke', resourceType: 'PatientGuardian', resourceId: proxyId, before: { status: before.status }, after: { status } });
  return updated;
}

export async function addAllergy(patientId: string, a: { substance: string; reaction?: string | undefined; severity: 'MILD' | 'MODERATE' | 'SEVERE' | 'UNKNOWN' }, actor: AuditActor) {
  const row = await prisma.allergy.create({ data: { patientId, substance: a.substance, reaction: a.reaction ?? null, severity: a.severity, recordedById: actor.userId } });
  await audit({ actor, action: 'allergy.create', resourceType: 'Allergy', resourceId: row.id, after: { patientId } });
  return row;
}

export async function addHistoryEntry(patientId: string, e: { type: 'CONDITION' | 'SURGERY' | 'FAMILY_HISTORY' | 'CURRENT_MEDICATION' | 'NOTE'; description: string; onsetDate?: string | undefined }, actor: AuditActor) {
  const row = await prisma.medicalHistoryEntry.create({
    data: { patientId, type: e.type, description: e.description, onsetDate: e.onsetDate ? dateOnly(e.onsetDate) : null, recordedById: actor.userId },
  });
  await audit({ actor, action: 'history.create', resourceType: 'MedicalHistoryEntry', resourceId: row.id, after: { patientId, type: e.type } });
  return row;
}

export async function deactivateRecord(kind: 'allergy' | 'history', recordId: string, patientId: string, actor: AuditActor) {
  const where = { id: recordId, patientId };
  const count =
    kind === 'allergy'
      ? (await prisma.allergy.updateMany({ where, data: { status: 'INACTIVE' } })).count
      : (await prisma.medicalHistoryEntry.updateMany({ where, data: { status: 'INACTIVE' } })).count;
  if (!count) throw notFound('Record');
  await audit({ actor, action: `${kind}.deactivate`, resourceType: kind === 'allergy' ? 'Allergy' : 'MedicalHistoryEntry', resourceId: recordId });
}
