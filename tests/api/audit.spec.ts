/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../fixtures/index.js';
import { expectOk } from '../utils/assertions.js';
import { checkedInEncounter, finalizedPrescription, ITEM } from '../utils/flows.js';
import { expectDbRejects } from '../utils/db.js';
import { uniqueEmail } from '../utils/factories.js';
import { STRONG_PASSWORD } from '../data/testData.js';

test.describe('audit trail', () => {
  test('critical events are recorded', async ({ as, refs }) => {
    const admin = await as('admin');
    const { patient, encounter, doctor } = await checkedInEncounter(as, refs.testDoctorId);
    const rx = await finalizedPrescription(doctor, encounter.id);
    expectOk(await doctor.post(`/api/prescriptions/${rx.id}/amend`, { reason: 'Audit test amendment', items: [ITEM] }));
    expectOk(await doctor.get(`/api/patients/${patient.id}/medical-profile`));
    const user = expectOk(await admin.post('/api/admin/users', { email: uniqueEmail('staff'), displayName: 'Audit Staff', password: STRONG_PASSWORD, roles: [{ role: 'NURSE' }] }), 201) as any;
    expectOk(await admin.post(`/api/admin/users/${user.id}/roles`, { role: 'RECEPTIONIST' }), 201);
    const actions = async (resourceId: string) => (expectOk(await admin.get('/api/audit', { params: { resourceId, pageSize: 100 } })) as any[]).map((a) => a.action);
    expect(await actions(patient.id)).toEqual(expect.arrayContaining(['patient.create', 'record.access']));
    expect(await actions(rx.id)).toEqual(expect.arrayContaining(['prescription.create', 'prescription.finalize', 'prescription.amend']));
    expect(await actions(user.id)).toEqual(expect.arrayContaining(['user.create', 'role.grant']));
    const logins = expectOk(await admin.get('/api/audit', { params: { action: 'auth.login', pageSize: 5 } })) as any[];
    expect(logins.length).toBeGreaterThan(0);
  });

  test('audit rows are append-only at the database level', async ({ as }) => {
    await as('admin');
    expect(await expectDbRejects(`UPDATE "AuditLog" SET "action" = 'tampered' WHERE id = (SELECT id FROM "AuditLog" LIMIT 1)`)).toMatch(/append-only/);
    expect(await expectDbRejects(`DELETE FROM "AuditLog" WHERE id = (SELECT id FROM "AuditLog" LIMIT 1)`)).toMatch(/append-only/);
    expect(await expectDbRejects(`DELETE FROM "NotificationConsent" WHERE id = (SELECT id FROM "NotificationConsent" LIMIT 1)`)).toMatch(/append-only/);
  });
});
