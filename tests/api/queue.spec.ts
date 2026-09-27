/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../fixtures/index.js';
import { expectOk } from '../utils/assertions.js';
import { createPatient } from '../utils/factories.js';

async function walkIn(reception: any, doctorId: string, facilityId: string) {
  const p = await createPatient(reception);
  const a = expectOk(await reception.post('/api/appointments/walk-ins', { patientId: p.id, doctorId, facilityId }), 201);
  return { p, a };
}

test.describe.serial('queue', () => {
  test('call next, recall, skip/requeue, absent → NO_SHOW, transfer; public display hides identity', async ({ as, refs }) => {
    const reception = await as('reception');
    const doctorId = refs.queueDoctorId;
    const one = await walkIn(reception, doctorId, refs.rscFacilityId);
    const two = await walkIn(reception, doctorId, refs.rscFacilityId);
    const three = await walkIn(reception, doctorId, refs.rscFacilityId);
    const view = expectOk(await reception.get('/api/queue', { params: { doctorId, facilityId: refs.rscFacilityId } })) as any;
    const queueId = view.queue.id;
    expect(view.waitingCount).toBeGreaterThanOrEqual(3);

    // drain anything older, then operate on our three tokens
    const tokenOf = async (apptId: string) => ((expectOk(await reception.get('/api/queue', { params: { doctorId, facilityId: refs.rscFacilityId } })) as any).tokens as any[]).find((t) => t.appointment?.id === apptId);
    const t1 = await tokenOf(one.a.id);
    expectOk(await reception.post(`/api/queue/tokens/${t1.id}/skip`));
    expect((await tokenOf(one.a.id)).status).toBe('SKIPPED');
    expectOk(await reception.post(`/api/queue/tokens/${t1.id}/requeue`));
    expect((await tokenOf(one.a.id)).status).toBe('WAITING');

    const called = expectOk(await reception.post(`/api/queue/${queueId}/call-next`)) as any;
    expect(called.status).toBe('CALLED');
    const recalled = expectOk(await reception.post(`/api/queue/tokens/${called.id}/recall`)) as any;
    expect(recalled.recallCount).toBe(1);

    const t2 = await tokenOf(two.a.id);
    expectOk(await reception.post(`/api/queue/tokens/${t2.id}/absent`));
    expect((expectOk(await reception.get(`/api/appointments/${two.a.id}`)) as any).status).toBe('NO_SHOW');

    const t3 = await tokenOf(three.a.id);
    const moved = expectOk(await reception.post(`/api/queue/tokens/${t3.id}/transfer`, { doctorId: refs.testDoctorId })) as any;
    expect(moved.tokenNumber).toBeGreaterThan(0);
    expect((expectOk(await reception.get(`/api/appointments/${three.a.id}`)) as any).doctor.id).toBe(refs.testDoctorId);

    const display = await reception.get(`/api/queue/display/${queueId}`);
    const text = JSON.stringify(expectOk(display));
    for (const p of [one.p, two.p, three.p]) {
      expect(text).not.toContain(p.fullName);
      expect(text).not.toContain(p.uhid);
      expect(text).not.toContain(p.id);
    }
  });

  test('patients and lab staff cannot operate the queue', async ({ as, refs }) => {
    const patient = await as('patient');
    const lab = await as('lab');
    for (const c of [patient, lab]) {
      const r = await c.get('/api/queue', { params: { doctorId: refs.queueDoctorId, facilityId: refs.rscFacilityId } });
      expect(r.status).toBe(403);
    }
  });
});
