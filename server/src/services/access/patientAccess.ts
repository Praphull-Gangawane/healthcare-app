import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { audit } from '../audit.service.js';
import { hasPermission, inFacilityScope, type Principal } from '../auth/principal.js';

/**
 * What the caller wants to do with a patient's data. Each purpose maps to a least-privilege rule:
 *  - demographics: registration/scheduling data (name, contact, UHID)
 *  - appointments: appointment/queue data
 *  - clinical:     encounters, vitals, diagnoses, prescriptions, lab results, documents
 *  - billing:      invoices/payments
 */
export type AccessPurpose = 'demographics' | 'appointments' | 'clinical' | 'billing';

export interface AccessOptions {
  /** Break-glass reason (header X-Access-Reason). Only honoured with clinical:break_glass. */
  breakGlassReason?: string | undefined;
}

export interface AccessDecision {
  allowed: boolean;
  basis?: 'self' | 'proxy' | 'care_relationship' | 'facility_scope' | 'staff_permission' | 'break_glass';
}

/** Is `principal` the patient themself, or an ACTIVE proxy with sufficient access level? */
async function portalBasis(p: Principal, patientId: string, purpose: AccessPurpose): Promise<AccessDecision> {
  if (!p.permissions.has('portal:self')) return { allowed: false };
  if (p.selfPatientId === patientId) return { allowed: true, basis: 'self' };
  const proxy = await prisma.patientGuardian.findUnique({
    where: { patientId_proxyUserId: { patientId, proxyUserId: p.userId } },
  });
  if (!proxy || proxy.status !== 'ACTIVE') return { allowed: false };
  if (proxy.validUntil && proxy.validUntil < new Date()) return { allowed: false };
  if (proxy.accessLevel === 'APPOINTMENTS_ONLY' && (purpose === 'clinical' || purpose === 'billing')) {
    return { allowed: false };
  }
  return { allowed: true, basis: 'proxy' };
}

/** Doctor: has/had an appointment, encounter or order with this patient. */
async function hasCareRelationship(doctorId: string, patientId: string): Promise<boolean> {
  const [appt, enc] = await Promise.all([
    prisma.appointment.findFirst({ where: { doctorId, patientId }, select: { id: true } }),
    prisma.encounter.findFirst({ where: { doctorId, patientId }, select: { id: true } }),
  ]);
  return !!appt || !!enc;
}

/** Nurse: patient has an appointment in one of the nurse's facilities. */
async function hasFacilityRelationship(p: Principal, patientId: string): Promise<boolean> {
  const appt = await prisma.appointment.findFirst({
    where: { patientId, ...(p.facilityScope === 'ALL' ? {} : { facilityId: { in: p.facilityScope } }) },
    select: { id: true },
  });
  return !!appt;
}

async function staffBasis(
  p: Principal,
  patientId: string,
  purpose: AccessPurpose,
  opts: AccessOptions,
): Promise<AccessDecision> {
  switch (purpose) {
    case 'demographics':
      return hasPermission(p, 'patient:read') ? { allowed: true, basis: 'staff_permission' } : { allowed: false };
    case 'appointments':
      return hasPermission(p, 'appointment:read') ? { allowed: true, basis: 'staff_permission' } : { allowed: false };
    case 'billing':
      return hasPermission(p, 'billing:read') ? { allowed: true, basis: 'staff_permission' } : { allowed: false };
    case 'clinical': {
      if (!hasPermission(p, 'clinical:read')) return { allowed: false };
      if (p.doctorId && (await hasCareRelationship(p.doctorId, patientId))) {
        return { allowed: true, basis: 'care_relationship' };
      }
      if (!p.doctorId && (await hasFacilityRelationship(p, patientId))) {
        return { allowed: true, basis: 'facility_scope' };
      }
      const reason = opts.breakGlassReason?.trim();
      if (reason && reason.length >= 10 && hasPermission(p, 'clinical:break_glass')) {
        return { allowed: true, basis: 'break_glass' };
      }
      return { allowed: false };
    }
    default:
      return { allowed: false };
  }
}

/**
 * Central patient-level authorization. Returns the patient when allowed. Patients in another
 * organization are reported as NOT_FOUND to avoid disclosing their existence.
 */
export async function assertPatientAccess(
  p: Principal,
  patientId: string,
  purpose: AccessPurpose,
  opts: AccessOptions = {},
) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) throw new AppError('NOT_FOUND', 'Patient not found.');

  let decision = await portalBasis(p, patientId, purpose);
  if (!decision.allowed && p.organizationId && patient.organizationId === p.organizationId) {
    decision = await staffBasis(p, patientId, purpose, opts);
  }
  if (!decision.allowed) {
    await audit({
      actor: p,
      action: `patient.access_denied`,
      resourceType: 'Patient',
      resourceId: patientId,
      outcome: 'DENIED',
      reason: purpose,
    });
    const sameOrg = !!p.organizationId && patient.organizationId === p.organizationId;
    if (!sameOrg && !p.permissions.has('portal:self')) throw new AppError('NOT_FOUND', 'Patient not found.');
    throw new AppError('FORBIDDEN', 'You do not have access to this patient record.');
  }
  if (decision.basis === 'break_glass') {
    await audit({
      actor: p,
      action: 'patient.break_glass',
      resourceType: 'Patient',
      resourceId: patientId,
      reason: opts.breakGlassReason ?? null,
    });
  }
  if (purpose === 'clinical') {
    await audit({ actor: p, action: 'record.access', resourceType: 'Patient', resourceId: patientId, reason: decision.basis ?? null });
  }
  return patient;
}

/** Patient ids a portal user may act for (self + active proxies). */
export async function portalPatientIds(p: Principal, purpose: AccessPurpose = 'appointments'): Promise<string[]> {
  if (!p.permissions.has('portal:self')) return [];
  const proxies = await prisma.patientGuardian.findMany({
    where: {
      proxyUserId: p.userId,
      status: 'ACTIVE',
      OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
      ...(purpose === 'clinical' || purpose === 'billing' ? { accessLevel: 'FULL' } : {}),
    },
    select: { patientId: true },
  });
  return [...(p.selfPatientId ? [p.selfPatientId] : []), ...proxies.map((x) => x.patientId)];
}

export function assertFacilityScope(p: Principal, facilityId: string) {
  if (!inFacilityScope(p, facilityId)) {
    throw new AppError('FORBIDDEN', 'This facility is outside your access scope.');
  }
}

/** The organization a staff member acts in (required for staff endpoints). */
export function staffOrg(p: Principal): string {
  if (!p.organizationId) throw new AppError('FORBIDDEN', 'This action requires a staff account.');
  return p.organizationId;
}
