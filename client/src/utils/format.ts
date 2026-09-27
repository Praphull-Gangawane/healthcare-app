/** Display helpers. The database stores UTC; everything is shown in the clinic time zone. */
export const TIME_ZONE = 'Asia/Kolkata';

const dateFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' });
const dateLongFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-IN', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true });
const isoDayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

const toDate = (v: string | Date) => (v instanceof Date ? v : new Date(v));

export function formatDate(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const d = toDate(v);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

export function formatDateLong(v: string | Date): string {
  return dateLongFmt.format(toDate(v));
}

export function formatTime(v: string | Date | null | undefined): string {
  if (!v) return '—';
  return timeFmt.format(toDate(v)).replace('am', 'AM').replace('pm', 'PM');
}

export function formatDateTime(v: string | Date | null | undefined): string {
  if (!v) return '—';
  return `${formatDate(v)}, ${formatTime(v)}`;
}

/** Date-only values (DOB, follow-up) are stored as UTC midnight: format without shifting the day. */
export function formatDateOnly(v: string | null | undefined): string {
  if (!v) return '—';
  const [y, m, d] = v.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** YYYY-MM-DD for "today" in the clinic time zone. */
export function todayIso(): string {
  return isoDayFmt.format(new Date());
}

export function isoDayOf(v: string | Date): string {
  return isoDayFmt.format(toDate(v));
}

/** Adds days to a YYYY-MM-DD string (calendar arithmetic, zone-independent). */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function isoDateParts(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  return {
    dow: new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', weekday: 'short' }).format(dt),
    day: String(d ?? ''),
    month: new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', month: 'short' }).format(dt),
    long: new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(dt),
  };
}

/** "09:30" → "9:30 AM" */
export function formatLocalTime(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });

export function formatMoney(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? inr.format(n) : '—';
}

export function ageFrom(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

export function formatNumber(v: string | number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(digits).replace(/\.0+$/, '');
}

export function initials(name: string): string {
  const parts = name.replace(/^Dr\.?\s+/i, '').split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1_048_576).toFixed(1)} MB`;
}

export function maskMobile(m: string | null | undefined): string {
  if (!m) return '—';
  return m.length > 5 ? `${m.slice(0, 3)}••••${m.slice(-3)}` : m;
}
