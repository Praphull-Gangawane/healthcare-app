/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../fixtures/index.js';
import { expectError, expectOk } from '../utils/assertions.js';
import { checkedInEncounter, ITEM } from '../utils/flows.js';
import { waitForOutbox } from '../utils/outbox.js';
import { addDays, todayIST } from '../utils/dates.js';

const REVIEW = 'This measurement is outside the configured reference range. Please review the result with a qualified healthcare professional.';

test.describe('clinical consultation', () => {
  test('vitals: valid, invalid, missing unit; HR 108 → review flag with safe wording', async ({ as, refs }) => {
    const { encounter, doctor } = await checkedInEncounter(as, refs.testDoctorId);
    const ok = expectOk(await doctor.post(`/api/encounters/${encounter.id}/vitals`, { measurements: [{ type: 'HEART_RATE', value: 108, unit: 'bpm' }, { type: 'BLOOD_PRESSURE', value: 120, value2: 80, unit: 'mmHg' }, { type: 'TEMPERATURE', value: 98.6, unit: '°F' }, { type: 'HEIGHT', value: 170, unit: 'cm' }, { type: 'WEIGHT', value: 70, unit: 'kg' }] }), 201) as any[];
    const hr = ok.find((v) => v.type === 'HEART_RATE');
    expect(hr.flag).toBe('REQUIRES_REVIEW');
    expect(hr.guidance.message).toBe(REVIEW);
    expect(JSON.stringify(hr)).not.toMatch(/disease|arrhythmia|heart attack|diagnos/i);
    expect(ok.find((v) => v.type === 'TEMPERATURE').unit).toBe('°C');
    expect(Number(ok.find((v) => v.type === 'BMI').value)).toBeCloseTo(24.2, 1);
    expectError(await doctor.post(`/api/encounters/${encounter.id}/vitals`, { measurements: [{ type: 'HEART_RATE', value: 700, unit: 'bpm' }] }), 400, 'VALIDATION_ERROR');
    const missing = expectError(await doctor.post(`/api/encounters/${encounter.id}/vitals`, { measurements: [{ type: 'OXYGEN_SATURATION', value: 97 }] }), 400);
    expect(JSON.stringify(missing.details)).toContain('MISSING_UNIT');
  });

  test('vital correction keeps the original (CORRECTED) and is audited', async ({ as, refs }) => {
    const { encounter, doctor, patient } = await checkedInEncounter(as, refs.testDoctorId);
    const [v] = expectOk(await doctor.post(`/api/encounters/${encounter.id}/vitals`, { measurements: [{ type: 'HEART_RATE', value: 180, unit: 'bpm' }] }), 201) as any[];
    const fixed = expectOk(await doctor.post(`/api/vitals/${v.id}/correct`, { value: 80, unit: 'bpm', reason: 'Typo on entry' })) as any;
    expect(fixed.correctsId).toBe(v.id);
    const history = expectOk(await doctor.get(`/api/vitals/patients/${patient.id}`, { params: { type: 'HEART_RATE', includeHistory: 'true' } })) as any[];
    expect(history.map((h) => h.status).sort()).toEqual(['ACTIVE', 'CORRECTED']);
    const admin = await as('admin');
    const audit = expectOk(await admin.get('/api/audit', { params: { action: 'vital.correct', resourceId: v.id } })) as any[];
    expect(audit[0].reason).toBe('Typo on entry');
  });

  test('SOAP draft optimistic locking → 409 STALE_VERSION', async ({ as, refs }) => {
    const { encounter, doctor } = await checkedInEncounter(as, refs.testDoctorId);
    const v2 = expectOk(await doctor.patch(`/api/encounters/${encounter.id}`, { version: encounter.version, historyOfIllness: 'first' })) as any;
    expect(v2.version).toBe(encounter.version + 1);
    expectError(await doctor.patch(`/api/encounters/${encounter.id}`, { version: encounter.version, historyOfIllness: 'stale' }), 409, 'STALE_VERSION');
  });

  test('diagnosis add/remove; completion blocked by draft prescription; follow-up reminder sent', async ({ as, refs }) => {
    const { encounter, doctor, patient } = await checkedInEncounter(as, refs.testDoctorId);
    const dx = expectOk(await doctor.post(`/api/encounters/${encounter.id}/diagnoses`, { description: 'Acute URI', code: 'J06.9', codeSystem: 'ICD10' }), 201) as any;
    expectOk(await doctor.delete(`/api/encounters/diagnoses/${dx.id}`));
    expectOk(await doctor.post(`/api/encounters/${encounter.id}/diagnoses`, { description: 'Acute URI', code: 'J06.9', codeSystem: 'ICD10' }), 201);
    const rx = expectOk(await doctor.post(`/api/encounters/${encounter.id}/prescriptions`), 201) as any;
    expectOk(await doctor.post(`/api/prescriptions/${rx.id}/items`, ITEM), 201);
    expectError(await doctor.post(`/api/encounters/${encounter.id}/complete`, {}), 422, 'UNPROCESSABLE');
    expectOk(await doctor.post(`/api/prescriptions/${rx.id}/finalize`, { confirm: true }));
    const done = expectOk(await doctor.post(`/api/encounters/${encounter.id}/complete`, { followUpDate: addDays(todayIST(), 14) })) as any;
    expect(done.status).toBe('COMPLETED');
    expect(done.diagnoses).toHaveLength(1);
    await waitForOutbox(doctor, patient.mobile, 'FOLLOW_UP_REMINDER');
    expectError(await doctor.post(`/api/encounters/${encounter.id}/diagnoses`, { description: 'late' }), 409, 'INVALID_STATE_TRANSITION');
  });

  test('only the treating doctor edits; another doctor needs break-glass to read', async ({ as, refs }) => {
    const { encounter } = await checkedInEncounter(as, refs.testDoctorId);
    const other = await as('demoDoctor');
    expectError(await other.patch(`/api/encounters/${encounter.id}`, { version: 1, planNotes: 'x' }), 403, 'FORBIDDEN');
    expect((await other.get(`/api/encounters/${encounter.id}`)).status).toBe(403);
  });
});
