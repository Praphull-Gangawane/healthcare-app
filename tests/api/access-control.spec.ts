/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../fixtures/index.js';
import { expectError, expectOk } from '../utils/assertions.js';
import { checkedInEncounter, finalizedPrescription } from '../utils/flows.js';
import { createPatient } from '../utils/factories.js';
import { findAvailableSlot } from '../utils/slots.js';

test.describe('access control (backend-enforced)', () => {
  test('unauthenticated access is blocked', async ({ anon, refs }) => {
    for (const path of [`/api/patients/${refs.demoPatientId}`, '/api/appointments', '/api/admin/users', `/api/prescriptions/patients/${refs.demoPatientId}`, '/api/audit']) {
      expectError(await anon.get(path), 401, 'AUTH_REQUIRED');
    }
  });

  test('patient cannot read another patient’s records', async ({ as, refs }) => {
    const p2 = await as('patient2');
    for (const path of [`/api/patients/${refs.demoPatientId}`, `/api/patients/${refs.demoPatientId}/medical-profile`, `/api/patients/${refs.demoPatientId}/timeline`, `/api/prescriptions/patients/${refs.demoPatientId}`, `/api/documents/patients/${refs.demoPatientId}`, `/api/investigations/patients/${refs.demoPatientId}`, `/api/vitals/patients/${refs.demoPatientId}`]) {
      expect([403, 404], path).toContain((await p2.get(path)).status);
    }
  });

  test('wrong-role endpoints → 403', async ({ as }) => {
    const patient = await as('patient');
    const lab = await as('lab');
    const accountant = await as('accountant');
    expectError(await patient.get('/api/admin/users'), 403, 'FORBIDDEN');
    expectError(await patient.get('/api/audit'), 403, 'FORBIDDEN');
    expectError(await lab.post('/api/patients', { firstName: 'x' }), 403, 'FORBIDDEN');
    expectError(await accountant.get('/api/patients', { params: { q: 'Priya' } }), 403, 'FORBIDDEN');
  });

  test('doctor without care relationship is denied, break-glass with a reason works and is audited', async ({ as }) => {
    const reception = await as('reception');
    const other = await as('demoDoctor');
    const admin = await as('admin');
    const p = await createPatient(reception);
    expectError(await other.get(`/api/patients/${p.id}/medical-profile`), 403, 'FORBIDDEN');
    expectError(await other.get(`/api/patients/${p.id}/medical-profile`, { headers: { 'X-Access-Reason': 'short' } }), 403);
    expectOk(await other.get(`/api/patients/${p.id}/medical-profile`, { headers: { 'X-Access-Reason': 'Unconscious patient in emergency department' } }));
    const audit = expectOk(await admin.get('/api/audit', { params: { action: 'patient.break_glass', resourceId: p.id } })) as any[];
    expect(audit.length).toBe(1);
  });

  test('reception, lab, accountant and admin cannot read clinical records', async ({ as, refs }) => {
    const { patient, encounter, doctor } = await checkedInEncounter(as, refs.testDoctorId);
    const rx = await finalizedPrescription(doctor, encounter.id);
    for (const role of ['reception', 'lab', 'accountant', 'admin'] as const) {
      const c = await as(role);
      expect([403, 404], `${role} medical-profile`).toContain((await c.get(`/api/patients/${patient.id}/medical-profile`)).status);
      expect([403, 404], `${role} encounter`).toContain((await c.get(`/api/encounters/${encounter.id}`)).status);
      expect([403, 404], `${role} prescription`).toContain((await c.get(`/api/prescriptions/${rx.id}`)).status);
    }
  });

  test('facility-scoped receptionist cannot book at another facility', async ({ as, refs }) => {
    const lvh = await as('receptionLakeview');
    const reception = await as('reception');
    const p = await createPatient(reception);
    const slot = await findAvailableSlot(lvh, refs.testDoctorId);
    expectError(await lvh.post('/api/appointments', { doctorId: refs.testDoctorId, patientId: p.id, startAt: slot!.startAt, type: 'IN_PERSON' }), 403, 'FORBIDDEN');
  });

  test('malformed input → 400; invalid JSON → 400 INVALID_JSON', async ({ as, request }) => {
    const reception = await as('reception');
    expectError(await reception.post('/api/patients', { dateOfBirth: 12 }), 400, 'VALIDATION_ERROR');
    const r = await request.post('/api/auth/login', { headers: { 'Content-Type': 'application/json' }, data: '{"email": ' });
    expect(r.status()).toBe(400);
    expect((await r.json()).error.code).toBe('INVALID_JSON');
  });
});
