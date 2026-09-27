/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../fixtures/index.js';
import { expectError, expectOk } from '../utils/assertions.js';
import { createPatient } from '../utils/factories.js';
import { availability, bookAppointment, bookWithRetry, findAvailableSlot } from '../utils/slots.js';
import { waitForOutbox, outboxFor } from '../utils/outbox.js';
import { addDays, todayIST } from '../utils/dates.js';

test.describe('appointments', () => {
  test('availability lists slots with capacity and status', async ({ anon, refs }) => {
    const slots = await availability(anon, refs.testDoctorId, todayIST());
    expect(slots.length).toBeGreaterThan(50);
    expect(slots[0]).toEqual(expect.objectContaining({ capacity: 1, status: expect.stringMatching(/AVAILABLE|FULL|PAST|BLOCKED/) }));
  });

  test('patient: hold → confirm; confirmation SMS/WhatsApp with minimal content', async ({ as, refs }) => {
    const patient = await as('patient');
    const { res } = await bookWithRetry(patient, refs.testDoctorId, (s) => patient.post('/api/appointments/holds', { doctorId: refs.testDoctorId, patientId: refs.demoPatientId, startAt: s.startAt, type: 'IN_PERSON' }));
    const hold = expectOk(res, 201);
    expect(hold.status).toBe('HELD');
    const appt = expectOk(await patient.post(`/api/appointments/${hold.id}/confirm`, {}));
    expect(appt.status).toBe('CONFIRMED');
    const mobile = (expectOk(await patient.get(`/api/patients/${refs.demoPatientId}`)) as any).mobile;
    const sms = await waitForOutbox(patient, mobile, 'APPOINTMENT_CONFIRMED');
    expect(sms.text).toContain(appt.appointmentNumber);
    await waitForOutbox(patient, mobile, 'APPOINTMENT_CONFIRMED', 'WHATSAPP');
  });

  test('front-desk search by appointment number, UHID and name', async ({ as, refs }) => {
    const reception = await as('reception');
    const p = await createPatient(reception);
    const { appointment } = await bookAppointment(reception, { doctorId: refs.testDoctorId, patientId: p.id });
    const day = (appointment.startAt as string).slice(0, 10);
    const params = (q: string) => ({ params: { from: addDays(day, -1), to: addDays(day, 1), q } });
    const byNumber = expectOk(await reception.get('/api/appointments', params(appointment.appointmentNumber))) as any[];
    expect(byNumber.map((a) => a.id)).toEqual([appointment.id]);
    const byUhid = expectOk(await reception.get('/api/appointments', params(p.uhid))) as any[];
    expect(byUhid.map((a) => a.id)).toContain(appointment.id);
    expect(byUhid.every((a) => a.patient.uhid === p.uhid)).toBe(true);
    const byName = expectOk(await reception.get('/api/appointments', params(p.lastName))) as any[];
    expect(byName.map((a) => a.id)).toContain(appointment.id);
  });

  test('book for an ACTIVE dependent', async ({ as, refs }) => {
    const patient = await as('patient');
    const { appointment } = await bookAppointment(patient, { doctorId: refs.testDoctorId, patientId: refs.dependentPatientId });
    expect(appointment.patient.id).toBe(refs.dependentPatientId);
  });

  test('reschedule: old RESCHEDULED, new CONFIRMED, notification sent', async ({ as, refs }) => {
    const reception = await as('reception');
    const p = await createPatient(reception);
    const { appointment, slot } = await bookAppointment(reception, { doctorId: refs.testDoctorId, patientId: p.id });
    const { res } = await bookWithRetry(reception, refs.testDoctorId, (s) => reception.post(`/api/appointments/${appointment.id}/reschedule`, { startAt: s.startAt }), { exclude: new Set([slot.startAt]) });
    const moved = expectOk(res);
    expect(moved.status).toBe('CONFIRMED');
    expect(moved.id).not.toBe(appointment.id);
    expect((expectOk(await reception.get(`/api/appointments/${appointment.id}`)) as any).status).toBe('RESCHEDULED');
    await waitForOutbox(reception, p.mobile, 'APPOINTMENT_RESCHEDULED');
  });

  test('cancel frees the slot and notifies', async ({ as, refs }) => {
    const reception = await as('reception');
    const p = await createPatient(reception);
    const { appointment, slot } = await bookAppointment(reception, { doctorId: refs.testDoctorId, patientId: p.id });
    expectOk(await reception.post(`/api/appointments/${appointment.id}/cancel`, { reason: 'test' }));
    await waitForOutbox(reception, p.mobile, 'APPOINTMENT_CANCELLED');
    const again = await reception.post('/api/appointments', { doctorId: refs.testDoctorId, patientId: p.id, startAt: slot.startAt, type: 'IN_PERSON' });
    expectOk(again, 201);
  });

  test('same-day booking + check-in issues a queue token', async ({ as, refs }) => {
    const reception = await as('reception');
    const p = await createPatient(reception);
    const { appointment } = await bookAppointment(reception, { doctorId: refs.testDoctorId, patientId: p.id }, { sameDay: true });
    const checked = expectOk(await reception.post(`/api/appointments/${appointment.id}/check-in`));
    expect(checked.status).toBe('WAITING');
    expect(checked.queueToken.tokenNumber).toBeGreaterThan(0);
  });

  test('check-in on a future day is refused', async ({ as, refs }) => {
    const reception = await as('reception');
    const p = await createPatient(reception);
    const { appointment } = await bookAppointment(reception, { doctorId: refs.testDoctorId, patientId: p.id }, { minDays: 3, maxDays: 30 });
    expectError(await reception.post(`/api/appointments/${appointment.id}/check-in`), 422);
  });

  test('walk-in goes straight to the queue', async ({ as, refs }) => {
    const reception = await as('reception');
    const p = await createPatient(reception);
    const w = expectOk(await reception.post('/api/appointments/walk-ins', { patientId: p.id, doctorId: refs.testDoctorId, facilityId: refs.rscFacilityId, reason: 'walk-in' }), 201);
    expect(w.isWalkIn).toBe(true);
    expect(w.status).toBe('WAITING');
    expect(w.queueToken).toBeTruthy();
  });

  test('no-show is only allowed after the start time', async ({ as, refs }) => {
    const reception = await as('reception');
    const p = await createPatient(reception);
    const { appointment } = await bookAppointment(reception, { doctorId: refs.testDoctorId, patientId: p.id });
    expectError(await reception.post(`/api/appointments/${appointment.id}/no-show`), 422, 'UNPROCESSABLE');
  });

  test('reminders run is idempotent (no duplicate reminders)', async ({ as, refs }) => {
    const reception = await as('reception');
    const admin = await as('admin');
    const p = await createPatient(reception);
    await bookAppointment(reception, { doctorId: refs.testDoctorId, patientId: p.id }, { sameDay: true });
    expectOk(await admin.post('/api/appointments/reminders/run', { leadHours: 24 }));
    expectOk(await admin.post('/api/appointments/reminders/run', { leadHours: 24 }));
    await waitForOutbox(reception, p.mobile, 'APPOINTMENT_REMINDER');
    const reminders = (await outboxFor(reception, p.mobile, 'SMS')).filter((e) => e.templateKey === 'APPOINTMENT_REMINDER');
    expect(reminders).toHaveLength(1);
  });

  test('booking a non-schedule time → 422 DOCTOR_UNAVAILABLE; malformed → 400; unknown → 404', async ({ as, refs }) => {
    const reception = await as('reception');
    const p = await createPatient(reception);
    const slot = await findAvailableSlot(reception, refs.testDoctorId);
    const odd = new Date(new Date(slot!.startAt).getTime() + 7 * 60_000).toISOString();
    expectError(await reception.post('/api/appointments', { doctorId: refs.testDoctorId, patientId: p.id, startAt: odd, type: 'IN_PERSON' }), 422, 'DOCTOR_UNAVAILABLE');
    expectError(await reception.post('/api/appointments', { doctorId: refs.testDoctorId, startAt: 'tomorrow' }), 400, 'VALIDATION_ERROR');
    expectError(await reception.get('/api/appointments/doesnotexist123'), 404, 'NOT_FOUND');
  });

  test('patient cannot book for someone else', async ({ as, refs }) => {
    const patient = await as('patient');
    const slot = await findAvailableSlot(patient, refs.testDoctorId);
    expectError(await patient.post('/api/appointments', { doctorId: refs.testDoctorId, patientId: refs.patient2Id, startAt: slot!.startAt, type: 'IN_PERSON' }), 403, 'FORBIDDEN');
  });
});
