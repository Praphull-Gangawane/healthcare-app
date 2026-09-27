/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../fixtures/index.js';
import { expectError, expectOk } from '../utils/assertions.js';
import { createPatient, registerPortalUser, uniqueMobile } from '../utils/factories.js';
import { bookAppointment } from '../utils/slots.js';
import { notificationsFor, outboxFor, waitForOutbox } from '../utils/outbox.js';
import { checkedInEncounter, finalizedPrescription } from '../utils/flows.js';

test.describe('notifications', () => {
  test('opt-out is respected (SKIPPED_NO_CONSENT) and opt-in is explicit', async ({ as, refs }) => {
    const reception = await as('reception');
    const p = await createPatient(reception, { consents: { sms: false, whatsapp: false, email: false } });
    await bookAppointment(reception, { doctorId: refs.testDoctorId, patientId: p.id });
    const rows = await notificationsFor(reception, p.id);
    expect(rows.every((r) => ['SKIPPED_NO_CONSENT', 'SKIPPED_NO_CONTACT'].includes(r.status))).toBe(true);
    expect(await outboxFor(reception, p.mobile)).toHaveLength(0);
    expectOk(await reception.put(`/api/patients/${p.id}/consents`, { channel: 'SMS', optedIn: true }));
    await bookAppointment(reception, { doctorId: refs.testDoctorId, patientId: p.id });
    await waitForOutbox(reception, p.mobile, 'APPOINTMENT_CONFIRMED');
    expect(await outboxFor(reception, p.mobile, 'WHATSAPP')).toHaveLength(0);
  });

  test('retryable provider failure → retries → FAILED after max attempts; manual retry endpoint', async ({ as, refs }) => {
    const reception = await as('reception');
    const admin = await as('admin');
    const p = await createPatient(reception, { mobile: uniqueMobile('0000'), consents: { sms: true, whatsapp: false, email: false } });
    await bookAppointment(reception, { doctorId: refs.testDoctorId, patientId: p.id });
    const sms = () => notificationsFor(reception, p.id).then((r) => r.find((n) => n.channel === 'SMS'));
    expect((await sms()).status).toBe('QUEUED');
    for (let i = 0; i < 3; i += 1) expectOk(await reception.post('/api/test/notifications/process-due'));
    const final = await sms();
    expect(final.status).toBe('FAILED');
    expect(final.attempts).toBe(3);
    expect(final.logs.length).toBe(3);
    expect(final.logs.every((l: any) => l.failureReason === 'MOCK_TEMPORARY_FAILURE')).toBe(true);
    const retried = expectOk(await admin.post(`/api/notifications/${final.id}/retry`)) as any;
    expect(retried.status).toBe('FAILED');
  });

  test('permanent failure is not retried', async ({ as, refs }) => {
    const reception = await as('reception');
    const p = await createPatient(reception, { mobile: uniqueMobile('9999'), consents: { sms: true, whatsapp: false, email: false } });
    await bookAppointment(reception, { doctorId: refs.testDoctorId, patientId: p.id });
    const n = (await notificationsFor(reception, p.id)).find((x) => x.channel === 'SMS');
    expect(n.status).toBe('FAILED');
    expect(n.attempts).toBe(1);
  });

  test('delivery receipts update the log; message bodies are never exposed', async ({ as, refs }) => {
    const reception = await as('reception');
    const p = await createPatient(reception);
    await bookAppointment(reception, { doctorId: refs.testDoctorId, patientId: p.id });
    const msg = await waitForOutbox(reception, p.mobile, 'APPOINTMENT_CONFIRMED', 'WHATSAPP');
    expectOk(await reception.post('/api/test/notifications/receipt', { providerMessageId: msg.providerMessageId, status: 'READ' }));
    const rows = await notificationsFor(reception, p.id);
    const wa = rows.find((r) => r.channel === 'WHATSAPP');
    expect(wa.status).toBe('READ');
    expect(wa.logs[0].readAt).toBeTruthy();
    expect(JSON.stringify(rows)).not.toContain(msg.text);
    expect(rows[0]).not.toHaveProperty('variables');
  });

  test('secure link: requires sign-in as the same patient; expired → 410', async ({ as, refs, request }) => {
    const portal = await registerPortalUser();
    const reception = await as('reception');
    const doctor = await as('doctor');
    const { appointment } = await bookAppointment(reception, { doctorId: refs.testDoctorId, patientId: portal.patientId }, { sameDay: true });
    expectOk(await reception.post(`/api/appointments/${appointment.id}/check-in`));
    const enc = expectOk(await doctor.post('/api/encounters', { appointmentId: appointment.id }), 201) as any;
    const rx = await finalizedPrescription(doctor, enc.id);
    const sms = await waitForOutbox(reception, portal.mobile, 'PRESCRIPTION_READY');
    const token = /\/s\/([\w-]+)/.exec(sms.text)?.[1] as string;
    const anonRes = await request.post('/api/notifications/secure-links/resolve', { data: { token } });
    expect(anonRes.status()).toBe(401);
    const other = await registerPortalUser();
    expectError(await other.client.withContext(request).post('/api/notifications/secure-links/resolve', { token }), 403);
    const ok = expectOk(await portal.client.withContext(request).post('/api/notifications/secure-links/resolve', { token })) as any;
    expect(ok.resourceId).toBe(rx.id);
    expectOk(await reception.post('/api/test/secure-links/expire', { token }));
    expectError(await portal.client.withContext(request).post('/api/notifications/secure-links/resolve', { token }), 410, 'LINK_EXPIRED');
  });

  test('duplicate prevention: same event is sent once per channel', async ({ as, refs }) => {
    const { encounter, doctor, patient } = await checkedInEncounter(as, refs.testDoctorId);
    await finalizedPrescription(doctor, encounter.id);
    await waitForOutbox(doctor, patient.mobile, 'PRESCRIPTION_READY');
    const again = await doctor.post(`/api/encounters/${encounter.id}/complete`, {});
    expect(again.status).toBe(200);
    const all = (await outboxFor(doctor, patient.mobile, 'SMS')).filter((e) => e.templateKey === 'PRESCRIPTION_READY');
    expect(all).toHaveLength(1);
  });
});
