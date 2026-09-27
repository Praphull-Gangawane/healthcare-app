import { TZ } from './env.js';

/** YYYY-MM-DD in Asia/Kolkata for an instant. */
export const istDate = (d: Date | string = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));

/** HH:mm (24h) in Asia/Kolkata for an instant. */
export const istTime = (d: Date | string): string =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(d));

export const todayIST = (): string => istDate(new Date());

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** IST wall-clock (YYYY-MM-DD, HH:mm) → UTC ISO string. IST has no DST (UTC+05:30). */
export const istToUtcIso = (date: string, time: string): string => new Date(`${date}T${time}:00+05:30`).toISOString();

/** A random integer in [min, max]. */
export const randInt = (min: number, max: number): number => min + Math.floor(Math.random() * (max - min + 1));
