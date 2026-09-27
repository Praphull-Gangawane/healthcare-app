import type { VitalType } from '../generated/prisma/enums.js';

/**
 * Plausibility limits reject data-entry errors (e.g. HR 0 or 700). They are NOT clinical
 * reference ranges — those are clinician-configured (VitalReferenceRange) and only flag values
 * for review. Nothing here diagnoses a condition.
 */
export const VITAL_SPEC: Record<VitalType, { units: string[]; min: number; max: number; min2?: number; max2?: number; label: string }> = {
  HEART_RATE: { units: ['bpm'], min: 20, max: 300, label: 'Heart rate' },
  BLOOD_PRESSURE: { units: ['mmHg'], min: 50, max: 300, min2: 20, max2: 200, label: 'Blood pressure' },
  RESPIRATORY_RATE: { units: ['breaths/min'], min: 4, max: 80, label: 'Respiratory rate' },
  TEMPERATURE: { units: ['°C', '°F'], min: 30, max: 45, label: 'Temperature' },
  OXYGEN_SATURATION: { units: ['%'], min: 50, max: 100, label: 'Oxygen saturation' },
  HEIGHT: { units: ['cm'], min: 30, max: 250, label: 'Height' },
  WEIGHT: { units: ['kg'], min: 0.5, max: 400, label: 'Weight' },
  BMI: { units: ['kg/m²'], min: 5, max: 100, label: 'BMI' },
};

export interface VitalInput {
  type: VitalType;
  value: number;
  value2?: number | undefined;
  unit?: string | undefined;
  measuredAt?: string | undefined;
}

export interface NormalizedVital {
  type: VitalType;
  value: number;
  value2: number | null;
  unit: string;
  measuredAt: Date;
}

export type VitalCheck = { ok: true; vital: NormalizedVital } | { ok: false; code: 'MISSING_UNIT' | 'INVALID_UNIT' | 'OUT_OF_RANGE' | 'MISSING_VALUE' | 'FUTURE_TIMESTAMP'; message: string };

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

export function validateVital(input: VitalInput, now = new Date()): VitalCheck {
  const spec = VITAL_SPEC[input.type];
  if (!input.unit) return { ok: false, code: 'MISSING_UNIT', message: `${spec.label}: unit is required (${spec.units.join(' or ')}).` };
  if (!spec.units.includes(input.unit)) return { ok: false, code: 'INVALID_UNIT', message: `${spec.label}: unit must be ${spec.units.join(' or ')}.` };
  let value = input.value;
  let unit = input.unit;
  if (input.type === 'TEMPERATURE' && unit === '°F') {
    value = round(((value - 32) * 5) / 9);
    unit = '°C';
  }
  if (!Number.isFinite(value) || value < spec.min || value > spec.max) {
    return { ok: false, code: 'OUT_OF_RANGE', message: `${spec.label} value ${input.value} ${input.unit} is outside the plausible range. Please re-check the measurement.` };
  }
  let value2: number | null = null;
  if (input.type === 'BLOOD_PRESSURE') {
    if (input.value2 === undefined) return { ok: false, code: 'MISSING_VALUE', message: 'Blood pressure requires systolic and diastolic values.' };
    if (!Number.isFinite(input.value2) || input.value2 < (spec.min2 ?? 0) || input.value2 > (spec.max2 ?? Infinity) || input.value2 >= value) {
      return { ok: false, code: 'OUT_OF_RANGE', message: 'Diastolic value is not plausible for the systolic value entered.' };
    }
    value2 = input.value2;
  }
  const measuredAt = input.measuredAt ? new Date(input.measuredAt) : now;
  if (Number.isNaN(measuredAt.getTime()) || measuredAt.getTime() > now.getTime() + 5 * 60_000) {
    return { ok: false, code: 'FUTURE_TIMESTAMP', message: 'Measurement time cannot be in the future.' };
  }
  return { ok: true, vital: { type: input.type, value, value2, unit, measuredAt } };
}

export const computeBmi = (heightCm: number, weightKg: number) => round(weightKg / (heightCm / 100) ** 2);

export interface RangeRule {
  low: number;
  high: number;
  urgentLow?: number | null;
  urgentHigh?: number | null;
  low2?: number | null;
  high2?: number | null;
}

export type Flag = 'WITHIN_RANGE' | 'REQUIRES_REVIEW' | 'URGENT_REVIEW' | 'NOT_EVALUATED';

/** Compares a value to a clinician-configured range. Output is a review flag, never a diagnosis. */
export function evaluateAgainstRange(value: number, value2: number | null, rule: RangeRule | null): Flag {
  if (!rule) return 'NOT_EVALUATED';
  if ((rule.urgentLow != null && value <= rule.urgentLow) || (rule.urgentHigh != null && value >= rule.urgentHigh)) return 'URGENT_REVIEW';
  const out1 = value < rule.low || value > rule.high;
  const out2 = value2 != null && rule.low2 != null && rule.high2 != null && (value2 < rule.low2 || value2 > rule.high2);
  return out1 || out2 ? 'REQUIRES_REVIEW' : 'WITHIN_RANGE';
}
