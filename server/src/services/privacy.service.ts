import type { PrivacyRequestType } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { AppError, notFound } from '../lib/errors.js';
import { audit } from './audit.service.js';
import { portalPatientIds, staffOrg } from './access/patientAccess.js';
import type { Principal } from './auth/principal.js';

/**
 * Data-principal rights support (DPDP-oriented). Exports are machine-readable JSON of the
 * patient's own data. Deactivation disables portal access; clinical records are retained per the
 * configured retention policy — deletion of medical records is NOT automatic and needs legal review.
 */
export async function exportPatientData(p: Principal, patientId: string) {
  if (!(await portalPatientIds(p, 'clinical')).includes(patientId)) throw notFound('Patient');
  const data = await prisma.patient.findUniqueOrThrow({
    where: { id: patientId },
    include: {
      address: true,
      contacts: true,
      allergies: true,
      history: true,
      appointments: { select: { appointmentNumber: true, startAt: true, status: true, type: true, reason: true } },
      encounters: { where: { status: 'COMPLETED' }, select: { encounterNumber: true, startedAt: true, chiefComplaint: true, followUpDate: true, followUpInstructions: true, diagnoses: { where: { status: 'ACTIVE' }, select: { description: true, code: true } } } },
      vitals: { where: { status: 'ACTIVE' }, select: { type: true, value: true, value2: true, unit: true, measuredAt: true, source: true } },
      prescriptions: { where: { status: { in: ['FINALIZED', 'AMENDED'] } }, select: { prescriptionNumber: true, versions: { select: { versionNumber: true, snapshot: true, createdAt: true } } } },
      orders: { where: { releasedToPatientAt: { not: null } }, select: { orderNumber: true, investigation: { select: { name: true } }, results: { where: { status: 'ACTIVE' }, select: { parameterName: true, valueNumeric: true, valueText: true, unit: true, refLow: true, refHigh: true } } } },
      documents: { where: { visibility: 'PATIENT_VISIBLE', deletedAt: null }, select: { title: true, type: true, createdAt: true } },
      consents: { select: { channel: true, optedIn: true, source: true, createdAt: true } },
      healthReadings: { select: { metric: true, value: true, unit: true, measuredAt: true, validation: true } },
    },
  });
  await audit({ actor: p, action: 'data.export', resourceType: 'Patient', resourceId: patientId, reason: 'data_principal_request' });
  return { exportedAt: new Date().toISOString(), format: 'careflow-patient-export/v1', patient: data };
}

export async function createRequest(p: Principal, input: { patientId: string; type: PrivacyRequestType; details?: string | undefined }) {
  if (!(await portalPatientIds(p, 'clinical')).includes(input.patientId)) throw notFound('Patient');
  const req = await prisma.privacyRequest.create({ data: { patientId: input.patientId, type: input.type, details: input.details ?? null, requestedBy: p.userId } });
  await audit({ actor: p, action: 'privacy.request', resourceType: 'PrivacyRequest', resourceId: req.id, after: { type: input.type } });
  return req;
}

export async function listRequests(p: Principal) {
  const org = staffOrg(p);
  return prisma.privacyRequest.findMany({ where: { patient: { organizationId: org } }, include: { patient: { select: { uhid: true, fullName: true } } }, orderBy: { createdAt: 'desc' } });
}

export async function myRequests(p: Principal) {
  const ids = await portalPatientIds(p, 'clinical');
  return prisma.privacyRequest.findMany({ where: { patientId: { in: ids } }, orderBy: { createdAt: 'desc' } });
}

export async function resolveRequest(p: Principal, id: string, input: { status: 'IN_REVIEW' | 'COMPLETED' | 'REJECTED'; resolution: string }) {
  const req = await prisma.privacyRequest.findUnique({ where: { id }, include: { patient: true } });
  if (!req || req.patient.organizationId !== staffOrg(p)) throw notFound('Request');
  if (req.type === 'ERASURE' && input.status === 'COMPLETED') {
    throw new AppError('UNPROCESSABLE', 'Erasure of medical records requires legal review against retention obligations and cannot be completed automatically.');
  }
  await prisma.$transaction(async (tx) => {
    await tx.privacyRequest.update({ where: { id }, data: { status: input.status, resolution: input.resolution, resolvedBy: p.userId, resolvedAt: input.status === 'IN_REVIEW' ? null : new Date() } });
    if (req.type === 'ACCOUNT_DEACTIVATION' && input.status === 'COMPLETED') {
      await tx.patient.update({ where: { id: req.patientId }, data: { isActive: false, deactivatedAt: new Date() } });
      if (req.patient.userId) {
        await tx.user.update({ where: { id: req.patient.userId }, data: { status: 'DISABLED' } });
        await tx.session.updateMany({ where: { userId: req.patient.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
    }
    await audit({ actor: p, action: 'privacy.resolve', resourceType: 'PrivacyRequest', resourceId: id, after: { status: input.status } }, tx);
  });
  return prisma.privacyRequest.findUniqueOrThrow({ where: { id } });
}
