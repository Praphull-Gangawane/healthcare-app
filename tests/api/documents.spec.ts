/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../fixtures/index.js';
import { expectError, expectOk } from '../utils/assertions.js';
import { FILES } from '../utils/flows.js';
import { registerPortalUser } from '../utils/factories.js';

test.describe('medical documents', () => {
  test('valid PDF/PNG upload; unsafe filename sanitized; short-lived user-bound download', async ({ request }) => {
    const me = await registerPortalUser();
    const c = me.client.withContext(request);
    const doc = expectOk(await c.post('/api/documents', undefined, { multipart: { patientId: me.patientId, title: 'Old report', file: { name: '../../etc/pa ss<wd>.pdf', mimeType: 'application/pdf', buffer: FILES.pdf } } }), 201) as any;
    expect(doc.filename).not.toContain('/');
    expect(doc.filename).not.toMatch(/[<>]/);
    expect(doc.type).toBe('PATIENT_UPLOAD');
    expectOk(await c.post('/api/documents', undefined, { multipart: { patientId: me.patientId, file: { name: 'x.png', mimeType: 'image/png', buffer: FILES.png } } }), 201);
    const list = expectOk(await c.get(`/api/documents/patients/${me.patientId}`)) as any[];
    expect(list).toHaveLength(2);
    const { url } = expectOk(await c.get(`/api/documents/${doc.id}/url`)) as any;
    expect(url).toMatch(/^\/api\/documents\/download\//);
    const file = await c.get(url);
    expect(file.status).toBe(200);
    expect(file.headers['cache-control']).toContain('no-store');
    const other = await registerPortalUser();
    expect((await other.client.withContext(request).get(url)).status).toBe(403);
    expect([403, 404]).toContain((await other.client.withContext(request).get(`/api/documents/${doc.id}/url`)).status);
    expectError(await c.get(`${url.slice(0, -4)}AAAA`), 404);
  });

  test('rejects executables, MIME/magic mismatch and oversize files', async ({ request }) => {
    const me = await registerPortalUser();
    const c = me.client.withContext(request);
    const up = (name: string, mimeType: string, buffer: Buffer) => c.post('/api/documents', undefined, { multipart: { patientId: me.patientId, file: { name, mimeType, buffer } } });
    expectError(await up('virus.exe', 'application/octet-stream', FILES.exe), 415, 'FILE_REJECTED');
    expectError(await up('fake.pdf', 'application/pdf', FILES.exe), 415, 'FILE_REJECTED');
    expectError(await up('fake.png', 'image/png', FILES.pdf), 415, 'FILE_REJECTED');
    expectError(await up('report.pdf.exe', 'application/pdf', FILES.pdf), 415, 'FILE_REJECTED');
    expectError(await up('big.pdf', 'application/pdf', Buffer.concat([FILES.pdf, Buffer.alloc(3 * 1024 * 1024)])), 413, 'FILE_TOO_LARGE');
  });
});
