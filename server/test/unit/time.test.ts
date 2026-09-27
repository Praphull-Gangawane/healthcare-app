import { describe, expect, it } from 'vitest';
import { addDays, ageInYears, dateOnly, dayOfWeek, fromMinutes, localDate, toMinutes, zonedToUtc } from '../../src/lib/time.js';

const IST = 'Asia/Kolkata';

describe('zonedToUtc (Asia/Kolkata, UTC+05:30, no DST)', () => {
  it.each([
    ['2026-09-26', '09:00', '2026-09-26T03:30:00.000Z'],
    ['2026-09-26', '00:00', '2026-09-25T18:30:00.000Z'],
    ['2026-09-26', '05:29', '2026-09-25T23:59:00.000Z'],
    ['2026-09-26', '23:59', '2026-09-26T18:29:00.000Z'],
    ['2024-02-29', '12:00', '2024-02-29T06:30:00.000Z'],
    ['2026-12-31', '23:45', '2026-12-31T18:15:00.000Z'],
    ['2027-01-01', '00:15', '2026-12-31T18:45:00.000Z'],
  ])('%s %s IST → %s', (d, t, iso) => {
    expect(zonedToUtc(d, t, IST).toISOString()).toBe(iso);
  });

  it('works for UTC and a DST zone', () => {
    expect(zonedToUtc('2026-01-15', '10:00', 'UTC').toISOString()).toBe('2026-01-15T10:00:00.000Z');
    expect(zonedToUtc('2026-07-01', '09:00', 'Europe/London').toISOString()).toBe('2026-07-01T08:00:00.000Z');
    expect(zonedToUtc('2026-01-01', '09:00', 'Europe/London').toISOString()).toBe('2026-01-01T09:00:00.000Z');
  });
});

describe('localDate', () => {
  it('returns the IST calendar date around midnight', () => {
    expect(localDate(new Date('2026-09-25T18:29:59Z'), IST)).toBe('2026-09-25');
    expect(localDate(new Date('2026-09-25T18:30:00Z'), IST)).toBe('2026-09-26');
    expect(localDate(new Date('2026-09-26T18:29:00Z'), IST)).toBe('2026-09-26');
  });
  it('round-trips with zonedToUtc', () => {
    for (const d of ['2026-01-01', '2026-03-31', '2026-09-26', '2028-02-29']) {
      expect(localDate(zonedToUtc(d, '00:00', IST), IST)).toBe(d);
      expect(localDate(zonedToUtc(d, '23:59', IST), IST)).toBe(d);
    }
  });
});

describe('dayOfWeek', () => {
  it.each([
    ['2026-09-26', 6], // Saturday
    ['2026-09-27', 0], // Sunday
    ['2026-09-28', 1],
    ['2024-02-29', 4],
    ['2000-01-01', 6],
  ])('%s → %d', (d, dow) => expect(dayOfWeek(d)).toBe(dow));
});

describe('addDays', () => {
  it.each([
    ['2026-09-26', 1, '2026-09-27'],
    ['2026-09-30', 1, '2026-10-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2024-02-28', 1, '2024-02-29'],
    ['2025-02-28', 1, '2025-03-01'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2026-09-26', 0, '2026-09-26'],
    ['2026-09-26', 60, '2026-11-25'],
  ])('%s %+d → %s', (d, n, out) => expect(addDays(d, n)).toBe(out));
});

describe('small helpers', () => {
  it('dateOnly is midnight UTC', () => expect(dateOnly('2026-09-26').toISOString()).toBe('2026-09-26T00:00:00.000Z'));
  it('toMinutes/fromMinutes round-trip', () => {
    expect(toMinutes('13:45')).toBe(825);
    expect(fromMinutes(825)).toBe('13:45');
    expect(fromMinutes(0)).toBe('00:00');
  });
  it('ageInYears counts birthdays exactly', () => {
    const at = new Date('2026-09-26T00:00:00Z');
    expect(ageInYears(dateOnly('2008-09-26'), at)).toBe(18);
    expect(ageInYears(dateOnly('2008-09-27'), at)).toBe(17);
    expect(ageInYears(dateOnly('2019-06-15'), at)).toBe(7);
  });
});
