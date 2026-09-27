import { prisma } from '../lib/prisma.js';
import { audit } from './audit.service.js';
import { assertPatientAccess, portalPatientIds } from './access/patientAccess.js';
import * as fhir from '../integrations/fhir/mappers.js';
import type { PrescriptionSnapshot } from './pdf/prescriptionPdf.js';
import type { Principal } from './auth/principal.js';

/** FHIR R4 Bundle of a patient's record ($everything-style) via the mapping layer. */
export async function patientBundle(p: Principal, patientId: string) {
  const portal = (await portalPatientIds(p, 'clinical')).includes(patientId);
  if (!portal) await assertPatientAccess(p, patientId, 'clinical');
  const patient = await prisma.patient.findUniqueOrThrow({
    where: { id: patientId },
    include: {
      allergies: { where: { status: 'ACTIVE' } },
      encounters: { include: { doctor: true, diagnoses: { where: { status: 'ACTIVE' } } } },
      vitals: { where: { status: 'ACTIVE' } },
      prescriptions: { where: { status: { in: ['FINALIZED', 'AMENDED'] } }, include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } },
      orders: { where: portal ? { releasedToPatientAt: { not: null } } : {}, include: { investigation: true, results: { where: { status: 'ACTIVE' } } } },
      appointments: true,
      documents: { where: { deletedAt: null, ...(portal ? { visibility: 'PATIENT_VISIBLE' } : {}) } },
    },
  });
  const practitioners = new Map(patient.encounters.map((e) => [e.doctor.id, e.doctor]));
  const resources = [
    fhir.toFhirPatient(patient),
    ...[...practitioners.values()].map(fhir.toFhirPractitioner),
    ...patient.encounters.map(fhir.toFhirEncounter),
    ...patient.encounters.flatMap((e) => e.diagnoses.map(fhir.toFhirCondition)),
    ...patient.allergies.map(fhir.toFhirAllergy),
    ...patient.vitals.map(fhir.toFhirObservation),
    ...patient.prescriptions.flatMap((rx) => fhir.toFhirMedicationRequests(rx, ((rx.versions[0]?.snapshot as unknown as PrescriptionSnapshot | undefined)?.items ?? []))),
    ...patient.orders.flatMap((o) => fhir.toFhirDiagnosticReport(o, o.results)),
    ...patient.appointments.map(fhir.toFhirAppointment),
    ...patient.documents.map(fhir.toFhirDocumentReference),
  ];
  await audit({ actor: p, action: 'data.export', resourceType: 'Patient', resourceId: patientId, reason: 'fhir_bundle' });
  return fhir.bundle(resources);
}
