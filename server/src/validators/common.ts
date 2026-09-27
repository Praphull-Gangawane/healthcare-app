import { z } from 'zod';

export const id = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/, 'Invalid id');
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm');
/** Indian mobile numbers in E.164 (+91XXXXXXXXXX); other E.164 numbers accepted for future markets. */
export const mobile = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .transform((v) => (/^[6-9]\d{9}$/.test(v) ? `+91${v}` : v))
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Enter a valid mobile number'));
export const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
export const shortText = z.string().trim().min(1).max(200);
export const longText = z.string().trim().max(5000);
export const money = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Invalid amount'));

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// Only the paging fields: spreading the whole parsed query here would leak raw filter strings
// (e.g. `from`/`to`) over already-converted values at call sites that do `{ ...filters, ...page }`.
export const toPage = (p: { page: number; pageSize: number }) => ({
  page: p.page,
  pageSize: p.pageSize,
  skip: (p.page - 1) * p.pageSize,
  take: p.pageSize,
});
