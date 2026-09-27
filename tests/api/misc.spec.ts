/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../fixtures/index.js';
import { expectError, expectOk } from '../utils/assertions.js';
import { bookAppointment } from '../utils/slots.js';
import { addDays, todayIST } from '../utils/dates.js';

test.describe('platform', () => {
  test('health endpoints and config', async ({ anon }) => {
    expectOk(await anon.get('/api/health'));
    const ready = expectOk(await anon.get('/api/health/ready')) as any;
    expect(ready.providers.sms).toBe('mock-sms');
    expect((expectOk(await anon.get('/api/config')) as any).demoMode).toBe(true);
  });

  test('metrics require staff permission', async ({ anon, as }) => {
    expectError(await anon.get('/api/health/metrics'), 401);
    expectError(await (await as('patient')).get('/api/health/metrics'), 403);
    expectOk(await (await as('admin')).get('/api/health/metrics'));
  });

  test('unknown route → 404 envelope without internals', async ({ anon }) => {
    expectError(await anon.get('/api/does-not-exist'), 404, 'NOT_FOUND');
  });

  test('security headers are set', async ({ anon }) => {
    const r = await anon.get('/api/health');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBeTruthy();
    expect(r.headers['x-powered-by']).toBeUndefined();
    expect(r.headers['x-request-id']).toBeTruthy();
  });

  test('reports: JSON and CSV (formula-injection safe, audited)', async ({ as }) => {
    const admin = await as('admin');
    const from = addDays(todayIST(), -60);
    const to = addDays(todayIST(), 60);
    const json = expectOk(await admin.get('/api/reports/appointments', { params: { from, to } })) as any;
    expect(json.rows.length).toBeGreaterThan(0);
    const csv = await admin.get('/api/reports/appointments', { params: { from, to, format: 'csv' } });
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.split('\n')[0]).toContain('appointmentNumber');
    expect(csv.text).not.toMatch(/^[=+@]/m);
    expectOk(await admin.get('/api/reports/doctors', { params: { from, to } }));
    expectOk(await admin.get('/api/reports/revenue', { params: { from, to } }));
    expectError(await admin.get('/api/reports/clinical', { params: { from, to } }), 403);
  });

  test('FHIR bundle for own record', async ({ as, refs }) => {
    const patient = await as('patient');
    const r = await patient.get(`/api/interop/fhir/Patient/${refs.demoPatientId}/everything`);
    expect(r.status).toBe(200);
    expect(r.body.resourceType).toBe('Bundle');
    const types = new Set((r.body.entry as any[]).map((e) => e.resource.resourceType));
    for (const t of ['Patient', 'Encounter', 'Observation', 'MedicationRequest', 'Appointment']) expect(types.has(t), t).toBe(true);
  });

  test('teleconsultation join requires consent and returns a short-lived token, not a public link', async ({ as, refs }) => {
    const patient = await as('patient');
    // The test doctor has 5-minute slots around the clock, so a slot inside the join window
    // (from 15 minutes before start) always exists, whatever the time of day.
    const { appointment: appt } = await bookAppointment(patient, { doctorId: refs.testDoctorId, patientId: refs.demoPatientId, type: 'TELECONSULTATION' }, { sameDay: true, minLeadMinutes: 6, maxLeadMinutes: 14 });
    expectError(await patient.post(`/api/teleconsultation/appointments/${appt.id}/join`, {}), 422, 'CONSENT_REQUIRED');
    const joined = expectOk(await patient.post(`/api/teleconsultation/appointments/${appt.id}/join`, { consent: true })) as any;
    expect(joined.token).toBeTruthy();
    expect(joined.roomUrl).not.toMatch(/^https?:/);
    expect(new Date(joined.expiresAt).getTime()).toBeLessThan(Date.now() + 11 * 60_000);
  });

  test('privacy: patient data export is audited and contains only own data', async ({ as, refs }) => {
    const patient = await as('patient');
    const out = expectOk(await patient.get(`/api/privacy/patients/${refs.demoPatientId}/export`)) as any;
    expect(out.patient.id).toBe(refs.demoPatientId);
    expect(out.patient.passwordHash).toBeUndefined();
    expect([403, 404]).toContain((await patient.get(`/api/privacy/patients/${refs.patient2Id}/export`)).status);
    const r = expectOk(await patient.post('/api/privacy/requests', { patientId: refs.demoPatientId, type: 'ERASURE', details: 'test' }), 201) as any;
    const admin = await as('admin');
    expectError(await admin.post(`/api/privacy/requests/${r.id}/resolve`, { status: 'COMPLETED', resolution: 'done' }), 422);
  });
});
