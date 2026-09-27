import { useState } from 'react';
import type { MeasurementInput } from '../api/clinical';
import { computeBmi, fToC } from '../utils/vitals';
import { Button } from './Button';

interface Values {
  hr: string;
  sys: string;
  dia: string;
  rr: string;
  temp: string;
  tempUnit: '°C' | '°F';
  spo2: string;
  height: string;
  weight: string;
}

const EMPTY: Values = { hr: '', sys: '', dia: '', rr: '', temp: '', tempUnit: '°C', spo2: '', height: '', weight: '' };
const num = (s: string) => (s.trim() === '' ? null : Number(s));

/** Structured vitals entry. Units are explicit; plausibility is re-validated by the API. */
export function VitalsForm({ onSubmit, busy, error }: { onSubmit: (m: MeasurementInput[]) => Promise<unknown>; busy?: boolean; error?: string | null }) {
  const [v, setV] = useState<Values>(EMPTY);
  const [localError, setLocalError] = useState<string | null>(null);
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const h = num(v.height);
  const w = num(v.weight);
  const bmi = h && w ? computeBmi(h, w) : null;

  function build(): MeasurementInput[] | string {
    const out: MeasurementInput[] = [];
    const add = (type: MeasurementInput['type'], raw: string, unit: string) => {
      const n = num(raw);
      if (n !== null) out.push({ type, value: n, unit });
    };
    add('HEART_RATE', v.hr, 'bpm');
    if (v.sys || v.dia) {
      const s = num(v.sys);
      const d = num(v.dia);
      if (s === null || d === null) return 'Enter both systolic and diastolic blood pressure.';
      out.push({ type: 'BLOOD_PRESSURE', value: s, value2: d, unit: 'mmHg' });
    }
    add('RESPIRATORY_RATE', v.rr, 'breaths/min');
    add('TEMPERATURE', v.temp, v.tempUnit);
    add('OXYGEN_SATURATION', v.spo2, '%');
    add('HEIGHT', v.height, 'cm');
    add('WEIGHT', v.weight, 'kg');
    if (out.some((m) => !Number.isFinite(m.value) || (m.value2 !== undefined && !Number.isFinite(m.value2)))) return 'Enter numbers only.';
    if (!out.length) return 'Enter at least one measurement.';
    return out;
  }

  return (
    <form
      className="stack-sm"
      data-testid="vital-form"
      aria-label="Record vitals"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = build();
        if (typeof r === 'string') return setLocalError(r);
        setLocalError(null);
        try {
          await onSubmit(r);
          setV(EMPTY);
        } catch {
          /* error shown by parent */
        }
      }}
    >
      <div className="vital-grid">
        <div className="field">
          <label htmlFor="v-hr">Heart rate (bpm)</label>
          <input id="v-hr" className="input" inputMode="numeric" value={v.hr} onChange={set('hr')} />
        </div>
        <div className="field">
          <span id="v-bp-label" className="label">
            Blood pressure (mmHg)
          </span>
          <div className="bp-inputs" role="group" aria-labelledby="v-bp-label">
            <input id="v-sys" className="input" inputMode="numeric" aria-label="Systolic (mmHg)" placeholder="Sys" value={v.sys} onChange={set('sys')} />
            <span className="bp-sep" aria-hidden="true">
              /
            </span>
            <input id="v-dia" className="input" inputMode="numeric" aria-label="Diastolic (mmHg)" placeholder="Dia" value={v.dia} onChange={set('dia')} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="v-rr">Respiratory rate (breaths/min)</label>
          <input id="v-rr" className="input" inputMode="numeric" value={v.rr} onChange={set('rr')} />
        </div>
        <div className="field">
          <label htmlFor="v-temp">Temperature</label>
          <div className="unit-toggle">
            <input id="v-temp" className="input" inputMode="decimal" value={v.temp} onChange={set('temp')} />
            <select className="select" aria-label="Temperature unit" value={v.tempUnit} onChange={set('tempUnit')}>
              <option value="°C">°C</option>
              <option value="°F">°F</option>
            </select>
          </div>
          {v.tempUnit === '°F' && num(v.temp) ? <p className="hint">≈ {fToC(num(v.temp) as number)} °C</p> : null}
        </div>
        <div className="field">
          <label htmlFor="v-spo2">Oxygen saturation (%)</label>
          <input id="v-spo2" className="input" inputMode="numeric" value={v.spo2} onChange={set('spo2')} />
        </div>
        <div className="field">
          <label htmlFor="v-height">Height (cm)</label>
          <input id="v-height" className="input" inputMode="decimal" value={v.height} onChange={set('height')} />
        </div>
        <div className="field">
          <label htmlFor="v-weight">Weight (kg)</label>
          <input id="v-weight" className="input" inputMode="decimal" value={v.weight} onChange={set('weight')} />
        </div>
        <div className="field">
          <span className="label">BMI (calculated)</span>
          <p className="reading-value" aria-live="polite">
            {bmi ?? '—'}
          </p>
        </div>
      </div>
      {localError || error ? (
        <p className="field-error" role="alert">
          {localError ?? error}
        </p>
      ) : null}
      <div>
        <Button type="submit" variant="primary" icon="activity" loading={busy} loadingText="Saving…">
          Record vitals
        </Button>
      </div>
    </form>
  );
}
