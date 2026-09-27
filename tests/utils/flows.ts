/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ApiClient } from './api.js';
import { expectOk } from './assertions.js';
import { createPatient, type NewPatientInput } from './factories.js';
import type { Role } from '../data/testData.js';

const facilityCache = new Map<string, string>();
async function facilityOf(client: ApiClient, doctorId: string): Promise<string> {
  const hit = facilityCache.get(doctorId);
  if (hit) return hit;
  const d = expectOk(await client.get(`/api/directory/doctors/${doctorId}`));
  const id = d.departments[0].facility.id as string;
  facilityCache.set(doctorId, id);
  return id;
}

export interface EncounterFlow {
  patient: any;
  appointment: any;
  encounter: any;
  reception: ApiClient;
  doctor: ApiClient;
}

/** Reception registers a fresh patient and adds them as a walk-in for the test doctor; doctor starts the encounter. */
export async function checkedInEncounter(as: (r: Role) => Promise<ApiClient>, testDoctorId: string, patient: NewPatientInput = {}): Promise<EncounterFlow> {
  const reception = await as('reception');
  const doctor = await as('doctor');
  const p = await createPatient(reception, patient);
  // Walk-ins are queue-based (not slotted), so same-day capacity never runs out under parallel/repeated runs.
  const appointment = expectOk(await reception.post('/api/appointments/walk-ins', { patientId: p.id, doctorId: testDoctorId, facilityId: await facilityOf(reception, testDoctorId), reason: 'Automated test visit' }), 201);
  const encounter = expectOk(await doctor.post('/api/encounters', { appointmentId: appointment.id }), 201);
  return { patient: p, appointment, encounter, reception, doctor };
}

export const ITEM = { medicineName: 'Paracetamol', strength: '500 mg', dose: '1 tablet', route: 'Oral', frequency: 'Twice daily', timing: 'After food', durationDays: 5 };

/** Draft prescription with one item, finalized. */
export async function finalizedPrescription(doctor: ApiClient, encounterId: string) {
  const draft = expectOk(await doctor.post(`/api/encounters/${encounterId}/prescriptions`), 201);
  expectOk(await doctor.post(`/api/prescriptions/${draft.id}/items`, ITEM), 201);
  return expectOk(await doctor.post(`/api/prescriptions/${draft.id}/finalize`, { confirm: true }));
}

/** Tiny valid files for upload tests. */
export const FILES = {
  pdf: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'),
  png: Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6364f8cf00000301010018dd8db00000000049454e44ae426082', 'hex'),
  exe: Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 1)]),
};
