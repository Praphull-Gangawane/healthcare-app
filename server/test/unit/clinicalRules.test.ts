import { describe, expect, it } from 'vitest';
import { computeAbnormalFlag } from '../../src/services/investigation.service.js';
import { validateReading } from '../../src/services/healthData.service.js';

describe('computeAbnormalFlag', () => {
  it.each([
    [null, 12, 16, 'NOT_APPLICABLE'],
    [14, 12, 16, 'NORMAL'],
    [12, 12, 16, 'NORMAL'],
    [16, 12, 16, 'NORMAL'],
    [11.9, 12, 16, 'LOW'],
    [16.1, 12, 16, 'HIGH'],
    [250, null, 200, 'HIGH'],
    [150, null, 200, 'NORMAL'],
    [30, 40, null, 'LOW'],
    [5, null, null, 'NOT_APPLICABLE'],
    [0, 0, 5, 'NORMAL'],
  ] as const)('value %s ref [%s, %s] → %s', (v, lo, hi, flag) => {
    expect(computeAbnormalFlag(v, lo, hi)).toBe(flag);
  });
});

describe('validateReading (health data)', () => {
  const now = new Date('2026-09-26T06:00:00Z');
  const at = (minsAgo: number) => new Date(now.getTime() - minsAgo * 60_000);

  it('marks a plausible device reading VALID', () => {
    expect(validateReading({ bpm: 72, measuredAt: at(10) }, 'MOCK', now)).toEqual({ validation: 'VALID', message: null });
  });

  it('keeps camera/PPG readings as WELLNESS_ESTIMATE (never VALID)', () => {
    const r = validateReading({ bpm: 72, measuredAt: at(1) }, 'CAMERA_PPG_DEMO', now);
    expect(r.validation).toBe('WELLNESS_ESTIMATE');
    expect(r.message).toMatch(/not a clinically validated measurement/);
  });

  it.each([0, 19, 251, 400, Number.NaN, Number.POSITIVE_INFINITY])('rejects implausible bpm %s as INVALID', (bpm) => {
    expect(validateReading({ bpm, measuredAt: at(5) }, 'MOCK', now).validation).toBe('INVALID');
  });

  it('marks implausible camera readings INVALID rather than an estimate', () => {
    expect(validateReading({ bpm: 400, measuredAt: at(5) }, 'CAMERA_PPG_DEMO', now).validation).toBe('INVALID');
  });

  it('rejects future timestamps beyond 5 minutes of skew', () => {
    expect(validateReading({ bpm: 72, measuredAt: new Date(now.getTime() + 2 * 3_600_000) }, 'MOCK', now)).toMatchObject({ validation: 'INVALID', message: 'Reading timestamp is in the future.' });
    expect(validateReading({ bpm: 72, measuredAt: new Date(now.getTime() + 60_000) }, 'MOCK', now).validation).toBe('VALID');
  });

  it('rejects stale and unparseable timestamps', () => {
    expect(validateReading({ bpm: 72, measuredAt: at(31 * 24 * 60) }, 'MOCK', now).validation).toBe('INVALID');
    expect(validateReading({ bpm: 72, measuredAt: new Date('nope') }, 'MOCK', now).validation).toBe('INVALID');
  });
});
