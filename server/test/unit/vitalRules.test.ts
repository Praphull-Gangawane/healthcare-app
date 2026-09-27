import { describe, expect, it } from 'vitest';
import { computeBmi, evaluateAgainstRange, validateVital, VITAL_SPEC } from '../../src/domain/vitalRules.js';

const NOW = new Date('2026-09-26T06:00:00.000Z');

describe('validateVital', () => {
  it('accepts a plausible heart rate and defaults measuredAt to now', () => {
    const r = validateVital({ type: 'HEART_RATE', value: 72, unit: 'bpm' }, NOW);
    expect(r).toEqual({ ok: true, vital: { type: 'HEART_RATE', value: 72, value2: null, unit: 'bpm', measuredAt: NOW } });
  });

  it('rejects a missing unit', () => {
    const r = validateVital({ type: 'HEART_RATE', value: 72 }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('MISSING_UNIT');
      expect(r.message).toContain('bpm');
    }
  });

  it('rejects an invalid unit', () => {
    const r = validateVital({ type: 'OXYGEN_SATURATION', value: 97, unit: 'bpm' }, NOW);
    expect(r.ok === false && r.code).toBe('INVALID_UNIT');
  });

  it.each([
    ['HEART_RATE', 0, 'bpm'],
    ['HEART_RATE', 700, 'bpm'],
    ['OXYGEN_SATURATION', 101, '%'],
    ['TEMPERATURE', 50, '°C'],
    ['WEIGHT', 0.1, 'kg'],
    ['HEART_RATE', Number.NaN, 'bpm'],
    ['HEART_RATE', Number.POSITIVE_INFINITY, 'bpm'],
  ] as const)('rejects out-of-range %s %s %s', (type, value, unit) => {
    const r = validateVital({ type, value, unit }, NOW);
    expect(r.ok === false && r.code).toBe('OUT_OF_RANGE');
  });

  it('accepts boundary values of the plausibility range', () => {
    const s = VITAL_SPEC.HEART_RATE;
    expect(validateVital({ type: 'HEART_RATE', value: s.min, unit: 'bpm' }, NOW).ok).toBe(true);
    expect(validateVital({ type: 'HEART_RATE', value: s.max, unit: 'bpm' }, NOW).ok).toBe(true);
  });

  describe('blood pressure', () => {
    it('requires a diastolic value', () => {
      const r = validateVital({ type: 'BLOOD_PRESSURE', value: 120, unit: 'mmHg' }, NOW);
      expect(r.ok === false && r.code).toBe('MISSING_VALUE');
    });
    it('rejects diastolic >= systolic', () => {
      const r = validateVital({ type: 'BLOOD_PRESSURE', value: 120, value2: 120, unit: 'mmHg' }, NOW);
      expect(r.ok === false && r.code).toBe('OUT_OF_RANGE');
    });
    it('rejects implausible diastolic', () => {
      expect(validateVital({ type: 'BLOOD_PRESSURE', value: 250, value2: 10, unit: 'mmHg' }, NOW).ok).toBe(false);
      expect(validateVital({ type: 'BLOOD_PRESSURE', value: 120, value2: Number.NaN, unit: 'mmHg' }, NOW).ok).toBe(false);
    });
    it('accepts 120/80 and keeps value2', () => {
      const r = validateVital({ type: 'BLOOD_PRESSURE', value: 120, value2: 80, unit: 'mmHg' }, NOW);
      expect(r.ok && r.vital.value2).toBe(80);
    });
  });

  it('converts °F to °C (rounded to 0.1)', () => {
    const r = validateVital({ type: 'TEMPERATURE', value: 98.6, unit: '°F' }, NOW);
    expect(r.ok && r.vital).toMatchObject({ value: 37, unit: '°C' });
    const r2 = validateVital({ type: 'TEMPERATURE', value: 101.3, unit: '°F' }, NOW);
    expect(r2.ok && r2.vital.value).toBe(38.5);
  });

  it('range-checks °F after conversion', () => {
    const r = validateVital({ type: 'TEMPERATURE', value: 120, unit: '°F' }, NOW);
    expect(r.ok === false && r.code).toBe('OUT_OF_RANGE');
  });

  it('rejects a future timestamp but tolerates 5 minutes of clock skew', () => {
    const future = new Date(NOW.getTime() + 10 * 60_000).toISOString();
    const r = validateVital({ type: 'HEART_RATE', value: 72, unit: 'bpm', measuredAt: future }, NOW);
    expect(r.ok === false && r.code).toBe('FUTURE_TIMESTAMP');
    const skew = new Date(NOW.getTime() + 4 * 60_000).toISOString();
    expect(validateVital({ type: 'HEART_RATE', value: 72, unit: 'bpm', measuredAt: skew }, NOW).ok).toBe(true);
  });

  it('rejects an unparseable timestamp', () => {
    expect(validateVital({ type: 'HEART_RATE', value: 72, unit: 'bpm', measuredAt: 'not-a-date' }, NOW).ok).toBe(false);
  });
});

describe('evaluateAgainstRange', () => {
  const hr = { low: 60, high: 100, urgentLow: 40, urgentHigh: 130 };
  it('returns NOT_EVALUATED without a configured range', () => {
    expect(evaluateAgainstRange(72, null, null)).toBe('NOT_EVALUATED');
  });
  it.each([
    [72, 'WITHIN_RANGE'],
    [60, 'WITHIN_RANGE'],
    [100, 'WITHIN_RANGE'],
    [108, 'REQUIRES_REVIEW'],
    [55, 'REQUIRES_REVIEW'],
    [130, 'URGENT_REVIEW'],
    [140, 'URGENT_REVIEW'],
    [40, 'URGENT_REVIEW'],
  ] as const)('HR %d → %s', (v, flag) => {
    expect(evaluateAgainstRange(v, null, hr)).toBe(flag);
  });
  it('flags diastolic outside its own range', () => {
    const bp = { low: 90, high: 139, urgentHigh: 180, low2: 60, high2: 89 };
    expect(evaluateAgainstRange(120, 80, bp)).toBe('WITHIN_RANGE');
    expect(evaluateAgainstRange(120, 95, bp)).toBe('REQUIRES_REVIEW');
    expect(evaluateAgainstRange(185, 95, bp)).toBe('URGENT_REVIEW');
  });
  it('ignores null urgent bounds', () => {
    expect(evaluateAgainstRange(10, null, { low: 18.5, high: 24.9, urgentLow: null, urgentHigh: null })).toBe('REQUIRES_REVIEW');
  });
});

describe('computeBmi', () => {
  it('computes kg/m² rounded to one decimal', () => {
    expect(computeBmi(170, 65)).toBe(22.5);
    expect(computeBmi(180, 81)).toBe(25);
    expect(computeBmi(150, 45)).toBe(20);
  });
});
