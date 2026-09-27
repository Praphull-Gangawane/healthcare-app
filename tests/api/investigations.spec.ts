/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../fixtures/index.js';
import { expectError, expectOk } from '../utils/assertions.js';
import { checkedInEncounter, FILES } from '../utils/flows.js';
import { waitForOutbox } from '../utils/outbox.js';
import { registerPortalUser } from '../utils/factories.js';
import { bookAppointment } from '../utils/slots.js';

async function orderCbc(as: any, refs: any, patient: any = {}) {
  const flow = await checkedInEncounter(as, refs.testDoctorId, patient);
  const cbc = (expectOk(await flow.doctor.get('/api/investigations/catalog', { params: { q: 'CBC' } })) as any[])[0];
  const order = expectOk(await flow.doctor.post(`/api/encounters/${flow.encounter.id}/orders`, { investigationId: cbc.id, priority: 'URGENT', clinicalNotes: 'fasting not needed' }), 201) as any;
  return { ...flow, order };
}

test.describe('investigations & lab results', () => {
  test('order → lab worklist → collect → results with flags → verify → released to patient', async ({ as, refs, request }) => {
    const portal = await registerPortalUser();
    const reception = await as('reception');
    const doctor = await as('doctor');
    const lab = await as('lab');
    const { appointment } = await bookAppointment(reception, { doctorId: refs.testDoctorId, patientId: portal.patientId }, { sameDay: true });
    expectOk(await reception.post(`/api/appointments/${appointment.id}/check-in`));
    const enc = expectOk(await doctor.post('/api/encounters', { appointmentId: appointment.id }), 201) as any;
    const cbc = (expectOk(await doctor.get('/api/investigations/catalog', { params: { q: 'CBC' } })) as any[])[0];
    const order = expectOk(await doctor.post(`/api/encounters/${enc.id}/orders`, { investigationId: cbc.id }), 201) as any;
    const patient = portal.client.withContext(request);

    const work = expectOk(await lab.get('/api/investigations/worklist', { params: { status: 'ORDERED', pageSize: 100 } })) as any[];
    expect(work.some((o) => o.id === order.id)).toBe(true);
    expectError(await lab.post(`/api/investigations/orders/${order.id}/results`, { results: [{ parameterCode: 'HGB', valueNumeric: 10 }] }), 409);
    expectOk(await lab.post(`/api/investigations/orders/${order.id}/status`, { status: 'COLLECTED' }));
    expectError(await lab.post(`/api/investigations/orders/${order.id}/results`, { results: [{ parameterCode: 'NOPE', valueNumeric: 1 }] }), 400);
    const entered = expectOk(await lab.post(`/api/investigations/orders/${order.id}/results`, { results: [{ parameterCode: 'HGB', valueNumeric: 10.1 }, { parameterCode: 'WBC', valueNumeric: 7 }, { parameterCode: 'PLT', valueNumeric: 500 }] })) as any;
    const flags = Object.fromEntries(entered.results.map((r: any) => [r.parameterCode, r.abnormalFlag]));
    expect(flags).toEqual({ HGB: 'LOW', WBC: 'NORMAL', PLT: 'HIGH' });
    expect(entered.status).toBe('COMPLETED');

    expect((await patient.get(`/api/investigations/orders/${order.id}`)).status).toBe(404);
    expect(expectOk(await patient.get(`/api/investigations/patients/${portal.patientId}`))).toHaveLength(0);

    expectOk(await lab.post(`/api/investigations/orders/${order.id}/report`, undefined, { multipart: { file: { name: 'cbc.pdf', mimeType: 'application/pdf', buffer: FILES.pdf } } }), 201);
    const verified = expectOk(await lab.post(`/api/investigations/orders/${order.id}/verify`)) as any;
    expect(verified.status).toBe('VERIFIED');
    expect(verified.releasedToPatientAt).toBeTruthy();
    await waitForOutbox(lab, portal.mobile, 'LAB_REPORT_READY');
    const mine = expectOk(await patient.get(`/api/investigations/patients/${portal.patientId}`)) as any[];
    expect(mine[0].results).toHaveLength(3);
    const trend = expectOk(await patient.get(`/api/investigations/patients/${portal.patientId}/trend`, { params: { parameterCode: 'HGB' } })) as any[];
    expect(trend[0].value).toBe(10.1);
    expectError(await lab.post(`/api/investigations/orders/${order.id}/results`, { results: [{ parameterCode: 'HGB', valueNumeric: 11 }] }), 400);
  });

  test('lab cannot read consultation notes; reception/accountant cannot read results', async ({ as, refs }) => {
    const { order, encounter } = await orderCbc(as, refs);
    const lab = await as('lab');
    expect([403, 404]).toContain((await lab.get(`/api/encounters/${encounter.id}`)).status);
    const detail = expectOk(await lab.get(`/api/investigations/orders/${order.id}`)) as any;
    expect(JSON.stringify(detail)).not.toMatch(/historyOfIllness|assessmentNotes/);
    for (const role of ['reception', 'accountant'] as const) {
      const c = await as(role);
      expect([403, 404]).toContain((await c.get(`/api/investigations/orders/${order.id}`)).status);
    }
  });
});
