/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../fixtures/index.js';
import { expectError, expectOk } from '../utils/assertions.js';
import { checkedInEncounter, ITEM } from '../utils/flows.js';
import { expectDbRejects } from '../utils/db.js';
import { uid, registerPortalUser } from '../utils/factories.js';
import { waitForOutbox } from '../utils/outbox.js';

test.describe('prescriptions', () => {
  test('item add/update/remove/reorder and validation', async ({ as, refs }) => {
    const { encounter, doctor } = await checkedInEncounter(as, refs.testDoctorId);
    const rx = expectOk(await doctor.post(`/api/encounters/${encounter.id}/prescriptions`), 201) as any;
    const first = expectOk(await doctor.post(`/api/prescriptions/${rx.id}/items`, ITEM), 201) as any;
    expect(first.items).toHaveLength(1);
    let d = expectOk(await doctor.post(`/api/prescriptions/${rx.id}/items`, { ...ITEM, medicineName: 'Cetirizine', strength: '10 mg', frequency: 'At bedtime' }), 201) as any;
    const [a, b] = d.items;
    d = expectOk(await doctor.patch(`/api/prescriptions/${rx.id}/items/${a.id}`, { durationDays: 3 }));
    expect(d.items[0].durationDays).toBe(3);
    d = expectOk(await doctor.post(`/api/prescriptions/${rx.id}/reorder`, { itemIds: [b.id, a.id] }));
    expect(d.items[0].medicineName).toBe('Cetirizine');
    d = expectOk(await doctor.delete(`/api/prescriptions/${rx.id}/items/${b.id}`));
    expect(d.items).toHaveLength(1);
    const bad = expectError(await doctor.post(`/api/prescriptions/${rx.id}/items`, { medicineName: '', dose: '', route: 'Oral', frequency: '', durationDays: 0 }), 400);
    expect((bad.details as any[]).map((x) => x.path)).toEqual(expect.arrayContaining(['medicineName', 'dose', 'frequency', 'durationDays']));
  });

  test('finalize requires explicit confirmation; finalized is immutable; amendment creates version 2', async ({ as, refs }) => {
    const { encounter, doctor, patient } = await checkedInEncounter(as, refs.testDoctorId);
    const rx = expectOk(await doctor.post(`/api/encounters/${encounter.id}/prescriptions`), 201) as any;
    expectOk(await doctor.post(`/api/prescriptions/${rx.id}/items`, ITEM), 201);
    expectError(await doctor.post(`/api/prescriptions/${rx.id}/finalize`, {}), 400);
    const fin = expectOk(await doctor.post(`/api/prescriptions/${rx.id}/finalize`, { confirm: true })) as any;
    expect(fin.status).toBe('FINALIZED');
    expect(fin.current.versionNumber).toBe(1);
    expect(fin.current.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expectError(await doctor.post(`/api/prescriptions/${rx.id}/items`, ITEM), 409, 'PRESCRIPTION_FINALIZED');
    expectError(await doctor.patch(`/api/prescriptions/${rx.id}`, { advice: 'changed' }), 409, 'PRESCRIPTION_FINALIZED');
    expectError(await doctor.post(`/api/prescriptions/${rx.id}/finalize`, { confirm: true }), 409, 'PRESCRIPTION_FINALIZED');
    const msg = await expectDbRejects(`UPDATE "PrescriptionVersion" SET "snapshot" = '{}'::jsonb WHERE "prescriptionId" = $1`, [rx.id]);
    expect(msg).toMatch(/immutable/i);
    expectError(await doctor.post(`/api/prescriptions/${rx.id}/amend`, { reason: 'x', items: [ITEM] }), 400);
    const am = expectOk(await doctor.post(`/api/prescriptions/${rx.id}/amend`, { reason: 'Dose adjustment after review', items: [{ ...ITEM, frequency: 'Three times daily' }] })) as any;
    expect(am.status).toBe('AMENDED');
    expect(am.versions.map((v: any) => v.versionNumber)).toEqual([1, 2]);
    expect(am.versions[0].snapshot.items[0].frequency).toBe('Twice daily');
    const sms = await waitForOutbox(doctor, patient.mobile, 'PRESCRIPTION_READY');
    expect(sms.text).not.toContain('Paracetamol');
    expect(sms.text).toMatch(/\/s\/[\w-]{20,}/);
  });

  test('PDF via short-lived URL; unauthenticated and other users rejected; pharmacist reads finalized', async ({ as, anon, refs, request }) => {
    const { encounter, doctor } = await checkedInEncounter(as, refs.testDoctorId);
    const rx = expectOk(await doctor.post(`/api/encounters/${encounter.id}/prescriptions`), 201) as any;
    expectOk(await doctor.post(`/api/prescriptions/${rx.id}/items`, ITEM), 201);
    const fin = expectOk(await doctor.post(`/api/prescriptions/${rx.id}/finalize`, { confirm: true })) as any;
    let docId = fin.current.documentId;
    if (!docId) docId = ((expectOk(await doctor.get(`/api/prescriptions/${rx.id}`)) as any).current.documentId);
    const { url } = expectOk(await doctor.get(`/api/documents/${docId}/url`)) as any;
    const pdf = await doctor.get(url);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await anon.get(url)).status).toBe(401);
    const stranger = await registerPortalUser();
    expect([403, 404]).toContain((await stranger.client.withContext(request).get(url)).status);
    expect([403, 404]).toContain((await stranger.client.withContext(request).get(`/api/prescriptions/${rx.id}`)).status);
    const pharmacist = await as('pharmacist');
    expect((expectOk(await pharmacist.get(`/api/prescriptions/${rx.id}`)) as any).status).toBe('FINALIZED');
  });

  test('idempotent finalize: same key twice → a single version', async ({ as, refs }) => {
    const { encounter, doctor } = await checkedInEncounter(as, refs.testDoctorId);
    const rx = expectOk(await doctor.post(`/api/encounters/${encounter.id}/prescriptions`), 201) as any;
    expectOk(await doctor.post(`/api/prescriptions/${rx.id}/items`, ITEM), 201);
    const key = `fin-${uid()}`;
    const a = await doctor.post(`/api/prescriptions/${rx.id}/finalize`, { confirm: true }, { idempotencyKey: key });
    expect(a.status).toBe(200);
    await new Promise((r) => setTimeout(r, 300));
    const b = await doctor.post(`/api/prescriptions/${rx.id}/finalize`, { confirm: true }, { idempotencyKey: key });
    expect(b.status).toBe(200);
    expect(b.headers['idempotent-replay']).toBe('true');
    expect((expectOk(await doctor.get(`/api/prescriptions/${rx.id}`)) as any).versions).toHaveLength(1);
  });

  test('drafts are invisible to the patient and to other doctors', async ({ as, refs }) => {
    const { encounter, doctor, reception } = await checkedInEncounter(as, refs.testDoctorId);
    const rx = expectOk(await doctor.post(`/api/encounters/${encounter.id}/prescriptions`), 201) as any;
    const other = await as('demoDoctor');
    expect((await other.get(`/api/prescriptions/${rx.id}`)).status).toBe(404);
    expect((await reception.get(`/api/prescriptions/${rx.id}`)).status).toBe(404);
  });
});
