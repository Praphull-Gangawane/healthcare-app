/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../fixtures/index.js';
import { expectError, expectOk } from '../utils/assertions.js';
import { adultDob, createPatient, minorDob, patientPayload, registerPortalUser, uniqueLetters, uniqueMobile } from '../utils/factories.js';
import { bookAppointment } from '../utils/slots.js';
import { STRONG_PASSWORD, TEST_APPOINTMENT } from '../data/testData.js';

test.describe('patients', () => {
  test('reception registers a patient → 201 with UHID and explicit consents', async ({ as }) => {
    const reception = await as('reception');
    const p = await createPatient(reception, { consents: { sms: true, whatsapp: false, email: true } });
    expect(p.uhid).toMatch(/^DHN-\d{8}$/);
    expect(p.fullName).toBe(`${p.input.firstName} ${p.input.lastName}`);
    const consents = expectOk(await reception.get(`/api/patients/${p.id}/consents`));
    expect(Object.fromEntries(consents.current.map((c: any) => [c.channel, c.optedIn]))).toEqual({ SMS: true, WHATSAPP: false, EMAIL: true });
  });

  test('invalid patient input → 400 with field details', async ({ as }) => {
    const reception = await as('reception');
    const r = await reception.post('/api/patients', { firstName: '', dateOfBirth: '2999-01-01', gender: 'X', mobile: '123' });
    const err = expectError(r, 400, 'VALIDATION_ERROR');
    const paths = (err.details as any[]).map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['firstName', 'dateOfBirth', 'gender', 'mobile']));
  });

  test('duplicate detection → 409 PATIENT_POSSIBLE_DUPLICATE with masked candidates; confirmNotDuplicate proceeds', async ({ as }) => {
    const reception = await as('reception');
    const admin = await as('admin');
    const first = await createPatient(reception);
    const again = patientPayload({ firstName: first.input.firstName, lastName: first.input.lastName, dateOfBirth: first.input.dateOfBirth, mobile: uniqueMobile() });
    const dup = expectError(await reception.post('/api/patients', again), 409, 'PATIENT_POSSIBLE_DUPLICATE');
    const candidates = (dup.details as any).candidates as any[];
    const match = candidates.find((c) => c.id === first.id);
    expect(match).toBeTruthy();
    expect(match.uhid).toBe(first.uhid);
    expect(match.mobile).toMatch(/^\+91\*{6}\d{2}$/); // masked
    expect(match.mobile).not.toBe(first.mobile);

    // Same mobile + DOB but different name is also a candidate.
    expectError(await reception.post('/api/patients', patientPayload({ dateOfBirth: first.input.dateOfBirth, mobile: first.mobile })), 409, 'PATIENT_POSSIBLE_DUPLICATE');

    const created = expectOk(await reception.post('/api/patients', { ...again, confirmNotDuplicate: true }), 201);
    expect(created.id).not.toBe(first.id);
    const audit = expectOk(await admin.get('/api/audit', { params: { action: 'patient.create_confirmed_not_duplicate', resourceId: created.id } }));
    expect(audit).toHaveLength(1);
  });

  test('self-registration that matches an existing record is refused without disclosing it', async ({ as, anon }) => {
    const reception = await as('reception');
    const existing = await createPatient(reception);
    const r = await anon.post('/api/auth/register', {
      ...patientPayload({ firstName: existing.input.firstName, lastName: existing.input.lastName, dateOfBirth: existing.input.dateOfBirth }),
      password: STRONG_PASSWORD,
      acceptTerms: true,
    });
    const err = expectError(r, 409, 'PATIENT_POSSIBLE_DUPLICATE');
    expect(err.details).toBeUndefined();
    expect(JSON.stringify(r.body)).not.toContain(existing.uhid);
  });

  test('search by UHID, name, mobile, date of birth and appointment number', async ({ as, refs }) => {
    const reception = await as('reception');
    const p = await createPatient(reception);
    const ids = async (params: Record<string, string>) => (expectOk(await reception.get('/api/patients', { params })) as any[]).map((x) => x.id);

    expect(await ids({ uhid: p.uhid })).toEqual([p.id]);
    expect(await ids({ q: p.uhid })).toEqual([p.id]);
    expect(await ids({ q: `${p.input.firstName} ${p.input.lastName}` })).toContain(p.id);
    expect(await ids({ q: p.input.lastName.toUpperCase() })).toContain(p.id);
    expect(await ids({ mobile: p.mobile.slice(-10) })).toEqual([p.id]);
    expect(await ids({ q: p.mobile.slice(-10) })).toContain(p.id);
    expect(await ids({ dateOfBirth: p.input.dateOfBirth, q: p.input.lastName })).toEqual([p.id]);

    const { appointment } = await bookAppointment(reception, { doctorId: refs.testDoctorId, patientId: p.id, reason: TEST_APPOINTMENT.reason });
    expect(await ids({ appointmentNumber: appointment.appointmentNumber })).toEqual([p.id]);
    expect(await ids({ q: appointment.appointmentNumber.toLowerCase() })).toEqual([p.id]);

    const list = await reception.get('/api/patients', { params: { uhid: p.uhid } });
    expect(list.body.meta).toMatchObject({ page: 1, total: 1 });
    // Search results are demographic only.
    expect(Object.keys(list.body.data[0])).not.toEqual(expect.arrayContaining(['allergies', 'history']));
    expectError(await reception.get('/api/patients', { params: { dateOfBirth: '26-09-2026' } }), 400, 'VALIDATION_ERROR');
  });

  test('profile update is audited with before/after values', async ({ as }) => {
    const reception = await as('reception');
    const admin = await as('admin');
    const p = await createPatient(reception);
    const newMobile = uniqueMobile();
    const updated = expectOk(await reception.patch(`/api/patients/${p.id}`, { mobile: newMobile, bloodGroup: 'B+' }));
    expect(updated.mobile).toBe(newMobile);
    const rows = expectOk(await admin.get('/api/audit', { params: { action: 'patient.update', resourceId: p.id } })) as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].before).toMatchObject({ mobile: p.mobile });
    expect(rows[0].after).toMatchObject({ mobile: newMobile, bloodGroup: 'B+' });
    expect(rows[0].actorUserId).toBe(reception.user?.id);
  });

  test('caregiver adds a minor dependent → ACTIVE proxy with access', async () => {
    const carer = await registerPortalUser();
    const dep = expectOk(await carer.client.post('/api/patients/me/dependents', { ...patientPayload({ dateOfBirth: minorDob() }), relationship: 'CHILD' }), 201);
    expect(dep.proxy).toMatchObject({ status: 'ACTIVE', isMinor: true, relationship: 'CHILD' });
    const list = expectOk(await carer.client.get('/api/patients/me/dependents')) as any[];
    expect(list.map((d) => d.patient.id)).toContain(dep.patient.id);
    expect(expectOk(await carer.client.get(`/api/patients/${dep.patient.id}`)).isMinor).toBe(true);
    expectOk(await carer.client.get(`/api/patients/${dep.patient.id}/medical-profile`));
  });

  test('adult dependent requires attestation (422 CONSENT_REQUIRED) and stays PENDING without access', async ({ as }) => {
    const carer = await registerPortalUser();
    const body = { ...patientPayload({ dateOfBirth: adultDob() }), relationship: 'PARENT' };
    expectError(await carer.client.post('/api/patients/me/dependents', body), 422, 'CONSENT_REQUIRED');
    const dep = expectOk(await carer.client.post('/api/patients/me/dependents', { ...body, adultConsentAttestation: true }), 201);
    expect(dep.proxy).toMatchObject({ status: 'PENDING', isMinor: false });
    // No access while pending.
    expect([403, 404]).toContain((await carer.client.get(`/api/patients/${dep.patient.id}/medical-profile`)).status);

    // Staff verification activates the proxy.
    const reception = await as('reception');
    const activated = expectOk(await reception.post(`/api/patients/${dep.patient.id}/proxies/${dep.proxy.id}/activate`));
    expect(activated.status).toBe('ACTIVE');
    expectOk(await carer.client.get(`/api/patients/${dep.patient.id}`));
  });

  test('consents: opt-out and opt-in are explicit and the history is append-only', async ({ as }) => {
    const u = await registerPortalUser({ consents: { sms: true, whatsapp: true, email: true } });
    const put = (channel: string, optedIn: boolean) => u.client.put(`/api/patients/${u.patientId}/consents`, { channel, optedIn });
    const current = (d: any) => Object.fromEntries(d.current.map((c: any) => [c.channel, c.optedIn]));

    expect(current(expectOk(await put('SMS', false)))).toMatchObject({ SMS: false, WHATSAPP: true });
    expect(current(expectOk(await put('SMS', true)))).toMatchObject({ SMS: true });
    const view = expectOk(await u.client.get(`/api/patients/${u.patientId}/consents`));
    const sms = view.history.filter((h: any) => h.channel === 'SMS');
    expect(sms.map((h: any) => h.optedIn)).toEqual([true, false, true]); // newest first, nothing overwritten
    expect(sms.every((h: any) => ['PORTAL', 'REGISTRATION'].includes(h.source))).toBe(true);
    expectError(await u.client.put(`/api/patients/${u.patientId}/consents`, { channel: 'FAX', optedIn: true }), 400, 'VALIDATION_ERROR');

    const admin = await as('admin');
    const audit = expectOk(await admin.get('/api/audit', { params: { action: 'consent.opt_out', actorUserId: u.user.id } })) as any[];
    expect(audit.length).toBe(1);
  });

  test('unknown patient id → 404 for staff', async ({ as }) => {
    const reception = await as('reception');
    expectError(await reception.get(`/api/patients/nonexistent${uniqueLetters(6)}`), 404, 'NOT_FOUND');
  });
});
