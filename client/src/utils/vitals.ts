import type { Vital, VitalType } from '../types/domain';
import { formatNumber } from './format';

export function computeBmi(heightCm: number, weightKg: number): number | null {
  if (!heightCm || !weightKg || heightCm <= 0) return null;
  const bmi = weightKg / (heightCm / 100) ** 2;
  return Number.isFinite(bmi) ? Math.round(bmi * 10) / 10 : null;
}

export const fToC = (f: number) => Math.round((((f - 32) * 5) / 9) * 10) / 10;

export function vitalValueText(v: Pick<Vital, 'type' | 'value' | 'value2'>): string {
  if (v.type === 'BLOOD_PRESSURE') return `${formatNumber(v.value, 0)}/${formatNumber(v.value2, 0)}`;
  return formatNumber(v.value);
}

export const VITAL_ORDER: VitalType[] = ['HEART_RATE', 'BLOOD_PRESSURE', 'RESPIRATORY_RATE', 'TEMPERATURE', 'OXYGEN_SATURATION', 'HEIGHT', 'WEIGHT', 'BMI'];

/** Latest reading per vital type. */
export function latestByType(vitals: Vital[]): Vital[] {
  const map = new Map<VitalType, Vital>();
  for (const v of vitals) {
    const prev = map.get(v.type);
    if (!prev || prev.measuredAt < v.measuredAt) map.set(v.type, v);
  }
  return VITAL_ORDER.map((t) => map.get(t)).filter((v): v is Vital => !!v);
}
