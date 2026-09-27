import { describe, expect, it } from 'vitest';
import { sanitizeFilename, validateUpload, type IncomingFile } from '../../src/services/document.service.js';
import { AppError } from '../../src/lib/errors.js';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0'), Buffer.alloc(32)]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(58), Buffer.from([0x80, 0, 0, 0]), Buffer.alloc(64), Buffer.from('PE\0\0'), Buffer.alloc(64)]);
const TEXT = Buffer.from('just some plain text, definitely not an image\n');

const file = (originalname: string, mimetype: string, buffer: Buffer): IncomingFile => ({ originalname, mimetype, buffer, size: buffer.length });

async function rejection(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    return err as AppError;
  }
  throw new Error('expected rejection');
}

describe('sanitizeFilename', () => {
  it.each([
    ['../../etc/passwd', 'passwd'],
    ['..\\..\\Windows\\System32\\evil.pdf', 'evil.pdf'],
    ['/var/www/report.pdf', 'report.pdf'],
    ['C:\\Users\\me\\scan.png', 'scan.png'],
    ['report\u0000.pdf', 'report.pdf'],
    ['bad\u0007\u001fname\u007f.pdf', 'badname.pdf'],
    ['.htaccess', 'htaccess'],
    ['...pdf', 'pdf'],
    ['my  lab   report.pdf', 'my lab report.pdf'],
    ['<b>alert(1)<b>.pdf', '_b_alert_1_b_.pdf'],
    ['<script>x</script>.pdf', 'script_.pdf'], // '/' is a separator → basename
    ['', 'document'],
    ['../', 'document'],
  ])('%j → %j', (input, expected) => {
    expect(sanitizeFilename(input)).toBe(expected);
  });

  it('replaces unicode/bidi characters so a RTL override cannot disguise an extension', () => {
    const out = sanitizeFilename('invoice\u202Efdp.exe');
    expect(out).not.toMatch(/[\u202E]/);
    expect(out.endsWith('.exe')).toBe(true);
    expect(sanitizeFilename('résumé.pdf')).toBe('r_sum_.pdf');
    expect(sanitizeFilename('रिपोर्ट.pdf')).toMatch(/^_+\.pdf$/);
  });

  it('normalizes full-width path separators without escaping the directory', () => {
    const out = sanitizeFilename('..／..／etc／passwd');
    expect(out).not.toContain('/');
    expect(out.startsWith('.')).toBe(false);
  });

  it('caps length at 100 characters and keeps the extension', () => {
    const out = sanitizeFilename(`${'a'.repeat(300)}.pdf`);
    expect(out.length).toBe(100);
    expect(out.endsWith('.pdf')).toBe(true);
  });

  it('only ever emits a safe character set', () => {
    for (const s of ['a/b\\c', 'x;rm -rf *', 'q"uote\'s.pdf', 'tab\tnew\nline.png']) {
      expect(sanitizeFilename(s)).toMatch(/^[\w.\- ]+$/);
    }
  });
});

describe('validateUpload (magic bytes must match declared type and extension)', () => {
  it('accepts a real PDF', async () => {
    await expect(validateUpload(file('report.pdf', 'application/pdf', PDF))).resolves.toEqual({ filename: 'report.pdf', mimeType: 'application/pdf' });
  });

  it('accepts a real PNG and JPEG', async () => {
    await expect(validateUpload(file('scan.PNG', 'image/png', PNG))).resolves.toMatchObject({ mimeType: 'image/png' });
    await expect(validateUpload(file('photo.jpeg', 'image/jpeg', JPEG))).resolves.toMatchObject({ mimeType: 'image/jpeg' });
  });

  it('returns a sanitized filename', async () => {
    await expect(validateUpload(file('../../x/lab<1>.pdf', 'application/pdf', PDF))).resolves.toMatchObject({ filename: 'lab_1_.pdf' });
  });

  it('rejects an .exe renamed to .pdf', async () => {
    const e = await rejection(validateUpload(file('invoice.pdf', 'application/pdf', EXE)));
    expect(e.code).toBe('FILE_REJECTED');
    expect(e.status).toBe(415);
  });

  it('rejects plain text renamed to .png', async () => {
    expect((await rejection(validateUpload(file('image.png', 'image/png', TEXT)))).code).toBe('FILE_REJECTED');
  });

  it('rejects a PNG declared as PDF (magic-bytes mismatch)', async () => {
    expect((await rejection(validateUpload(file('doc.pdf', 'application/pdf', PNG)))).code).toBe('FILE_REJECTED');
  });

  it('rejects an extension that does not match the declared type', async () => {
    expect((await rejection(validateUpload(file('doc.png', 'application/pdf', PDF)))).code).toBe('FILE_REJECTED');
    expect((await rejection(validateUpload(file('doc.pdf.exe', 'application/pdf', PDF)))).code).toBe('FILE_REJECTED');
  });

  it('rejects disallowed types even with valid content', async () => {
    expect((await rejection(validateUpload(file('page.html', 'text/html', Buffer.from('<html></html>'))))).code).toBe('FILE_REJECTED');
    expect((await rejection(validateUpload(file('vector.svg', 'image/svg+xml', Buffer.from('<svg/>'))))).code).toBe('FILE_REJECTED');
  });

  it('rejects missing, empty and oversize files', async () => {
    expect((await rejection(validateUpload(undefined))).code).toBe('VALIDATION_ERROR');
    expect((await rejection(validateUpload(file('e.pdf', 'application/pdf', Buffer.alloc(0))))).code).toBe('FILE_REJECTED');
    const big = file('big.pdf', 'application/pdf', PDF);
    big.size = 1_048_577; // UPLOAD_MAX_BYTES=1 MiB in the unit-test env
    const e = await rejection(validateUpload(big));
    expect(e.code).toBe('FILE_TOO_LARGE');
    expect(e.status).toBe(413);
  });
});
