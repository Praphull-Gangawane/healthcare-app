/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../fixtures/index.js';
import { expectError, expectOk } from '../utils/assertions.js';
import { registerPortalUser } from '../utils/factories.js';
import { bookAppointment } from '../utils/slots.js';

test.describe('health data (mock providers)', () => {
  test('permission denied → cannot sync; revoke stops collection', async ({ request }) => {
    const me = await registerPortalUser();
    const c = me.client.withContext(request);
    const src = expectOk(await c.post(`/api/health-data/patients/${me.patientId}/sources`, { providerType: 'MOCK', scenario: 'permission_denied' }), 201) as any;
    expect(src.permissionStatus).toBe('DENIED');
    expectError(await c.post(`/api/health-data/patients/${me.patientId}/sync`, { providerType: 'MOCK' }), 403, 'HEALTH_PERMISSION_DENIED');
    expectOk(await c.post(`/api/health-data/patients/${me.patientId}/sources`, { providerType: 'MOCK' }), 201);
    expectOk(await c.delete(`/api/health-data/patients/${me.patientId}/sources/MOCK`));
    expectError(await c.post(`/api/health-data/patients/${me.patientId}/sync`, { providerType: 'MOCK' }), 403, 'HEALTH_PERMISSION_DENIED');
  });

  test('granted sync stores VALID, not clinically validated readings (~72 bpm)', async ({ request }) => {
    const me = await registerPortalUser();
    const c = me.client.withContext(request);
    expectOk(await c.post(`/api/health-data/patients/${me.patientId}/sources`, { providerType: 'MOCK' }), 201);
    const rows = expectOk(await c.post(`/api/health-data/patients/${me.patientId}/sync`, { providerType: 'MOCK' })) as any[];
    expect(rows.map((r) => Number(r.value))).toEqual([71, 72, 73]);
    expect(rows.every((r) => r.validation === 'VALID' && r.isClinicallyValidated === false)).toBe(true);
  });

  test('device unavailable / provider failure → 503; invalid and future readings marked INVALID', async ({ request }) => {
    const me = await registerPortalUser();
    const c = me.client.withContext(request);
    expectOk(await c.post(`/api/health-data/patients/${me.patientId}/sources`, { providerType: 'MOCK' }), 201);
    expectError(await c.post(`/api/health-data/patients/${me.patientId}/sync`, { scenario: 'device_unavailable' }), 503, 'HEALTH_DEVICE_UNAVAILABLE');
    expectError(await c.post(`/api/health-data/patients/${me.patientId}/sync`, { scenario: 'provider_failure' }), 503, 'PROVIDER_UNAVAILABLE');
    const invalid = expectOk(await c.post(`/api/health-data/patients/${me.patientId}/sync`, { scenario: 'invalid_reading' })) as any[];
    expect(invalid.filter((r) => r.validation === 'INVALID')).toHaveLength(2);
    const future = expectOk(await c.post(`/api/health-data/patients/${me.patientId}/sync`, { scenario: 'future_timestamp' })) as any[];
    expect(future.some((r) => r.validation === 'INVALID' && /future/i.test(r.validationMessage))).toBe(true);
    expectError(await c.post(`/api/health-data/patients/${me.patientId}/sync`, { scenario: 'nonsense', providerType: 'NOT_A_PROVIDER' }), 400);
  });

  test('camera PPG → WELLNESS_ESTIMATE, never promotable; valid device reading promotable by the treating doctor', async ({ as, refs, request }) => {
    const me = await registerPortalUser();
    const c = me.client.withContext(request);
    expectOk(await c.post(`/api/health-data/patients/${me.patientId}/sources`, { providerType: 'CAMERA_PPG_DEMO', clientReportedStatus: 'GRANTED' }), 201);
    const [est] = expectOk(await c.post(`/api/health-data/patients/${me.patientId}/readings`, { providerType: 'CAMERA_PPG_DEMO', readings: [{ bpm: 76, measuredAt: new Date().toISOString(), externalId: 'cam-1' }] }), 201) as any[];
    expect(est.validation).toBe('WELLNESS_ESTIMATE');
    expect(est.isClinicallyValidated).toBe(false);
    expectOk(await c.post(`/api/health-data/patients/${me.patientId}/sources`, { providerType: 'MOCK' }), 201);
    const [valid] = expectOk(await c.post(`/api/health-data/patients/${me.patientId}/sync`, {})) as any[];
    const reception = await as('reception');
    const doctor = await as('doctor');
    await bookAppointment(reception, { doctorId: refs.testDoctorId, patientId: me.patientId });
    expectError(await doctor.post(`/api/health-data/readings/${est.id}/promote`, {}), 422, 'UNPROCESSABLE');
    const vital = expectOk(await doctor.post(`/api/health-data/readings/${valid.id}/promote`, {}), 201) as any;
    expect(vital.source).toBe('DEVICE');
    expect(vital.type).toBe('HEART_RATE');
    expectError(await doctor.post(`/api/health-data/readings/${valid.id}/promote`, {}), 409, 'CONFLICT');
  });

  test('staff cannot connect a patient’s device', async ({ as, refs }) => {
    const reception = await as('reception');
    expectError(await reception.post(`/api/health-data/patients/${refs.patient2Id}/sources`, { providerType: 'MOCK' }), 403);
  });
});
