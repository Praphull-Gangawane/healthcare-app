/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../fixtures/index.js';
import { expectOk } from '../utils/assertions.js';
import { createPatient } from '../utils/factories.js';
import { availability, findAvailableSlot } from '../utils/slots.js';
import { istDate } from '../utils/dates.js';
import { uid } from '../utils/factories.js';

test.describe('booking concurrency (mandatory)', () => {
  test('N simultaneous bookings of one slot → exactly one 201, the rest 409 SLOT_UNAVAILABLE', async ({ as, refs }) => {
    const reception = await as('reception');
    const patients = await Promise.all(Array.from({ length: 8 }, () => createPatient(reception)));
    const slot = await findAvailableSlot(reception, refs.testDoctorId, { minDays: 5, maxDays: 55 });
    expect(slot).toBeTruthy();
    const results = await Promise.all(
      patients.map((p) => reception.post('/api/appointments', { doctorId: refs.testDoctorId, patientId: p.id, startAt: slot!.startAt, type: 'IN_PERSON' })),
    );
    const ok = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);
    expect(ok).toHaveLength(1);
    expect(conflicts).toHaveLength(7);
    for (const c of conflicts) expect(c.body.error.code).toBe('SLOT_UNAVAILABLE');
    const after = (await availability(reception, refs.testDoctorId, istDate(slot!.startAt))).find((s) => s.startAt === slot!.startAt);
    expect(after?.booked).toBe(1);
    expect(after?.status).toBe('FULL');
  });

  test('patient and reception racing for the same slot → one winner', async ({ as, refs }) => {
    const reception = await as('reception');
    const patient = await as('patient');
    const other = await createPatient(reception);
    const slot = await findAvailableSlot(reception, refs.testDoctorId, { minDays: 5, maxDays: 55 });
    const [a, b] = await Promise.all([
      patient.post('/api/appointments', { doctorId: refs.testDoctorId, patientId: refs.demoPatientId, startAt: slot!.startAt, type: 'IN_PERSON' }),
      reception.post('/api/appointments', { doctorId: refs.testDoctorId, patientId: other.id, startAt: slot!.startAt, type: 'IN_PERSON' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });

  test('same Idempotency-Key submitted concurrently/twice creates one appointment', async ({ as, refs }) => {
    const reception = await as('reception');
    const p = await createPatient(reception);
    const slot = await findAvailableSlot(reception, refs.testDoctorId, { minDays: 5, maxDays: 55 });
    const key = `idem-${uid()}`;
    const body = { doctorId: refs.testDoctorId, patientId: p.id, startAt: slot!.startAt, type: 'IN_PERSON' };
    const first = await reception.post('/api/appointments', body, { idempotencyKey: key });
    const created = expectOk(first, 201);
    await new Promise((r) => setTimeout(r, 300));
    const replay = await reception.post('/api/appointments', body, { idempotencyKey: key });
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replay']).toBe('true');
    expect(replay.body.data.id).toBe(created.id);
    const list = expectOk(await reception.get('/api/appointments', { params: { patientId: p.id } })) as any[];
    expect(list).toHaveLength(1);
    const reused = await reception.post('/api/appointments', { ...body, reason: 'different' }, { idempotencyKey: key });
    expect(reused.status).toBe(422);
  });
});
