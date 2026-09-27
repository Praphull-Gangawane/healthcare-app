import { describe, expect, it } from 'vitest';
import { render, TEMPLATES, type TemplateKey } from '../../src/services/notifications/templates.js';

const KEYS = Object.keys(TEMPLATES) as TemplateKey[];
/** Words that would indicate clinical detail leaking into SMS/WhatsApp/email bodies. */
const CLINICAL = /diagnos|abnormal|positive|negative|result[s]? (is|are|show)|\bmg\b|tablet|capsule|dose|paracetamol|hypertension|diabetes|haemoglobin|glucose|bpm|mmhg/i;

const sampleVars = (key: TemplateKey) => Object.fromEntries(TEMPLATES[key].vars.map((v) => [v, `<<${v}>>`]));

describe('notification templates', () => {
  it.each(KEYS)('%s renders every declared variable', (key) => {
    const out = render(key, sampleVars(key));
    for (const v of TEMPLATES[key].vars) expect(out.text).toContain(`<<${v}>>`);
    expect(out.params).toEqual(TEMPLATES[key].vars.map((v) => `<<${v}>>`));
    expect(out.subject.startsWith('CareTest: ')).toBe(true);
    expect(out.text).toContain('CareTest');
  });

  it.each(KEYS)('%s contains no clinical detail', (key) => {
    const def = TEMPLATES[key];
    expect(def.subject).not.toMatch(CLINICAL);
    expect(render(key, sampleVars(key)).text).not.toMatch(CLINICAL);
  });

  it.each(KEYS)('%s ignores extra (clinical) variables', (key) => {
    const out = render(key, { ...sampleVars(key), medicine: 'Paracetamol 650 mg', diagnosis: 'Hypertension', result: 'HGB 9.1 LOW' });
    expect(out.text).not.toMatch(/Paracetamol|Hypertension|HGB/);
  });

  it.each(KEYS)('%s throws when a required variable is missing', (key) => {
    if (!TEMPLATES[key].vars.length) return;
    expect(() => render(key, {})).toThrow(/missing variables/);
  });

  it('prescription and lab messages only point to the secure portal', () => {
    const rx = render('PRESCRIPTION_READY', { link: 'http://localhost:5173/s/tok' }).text;
    const lab = render('LAB_REPORT_READY', { link: 'http://localhost:5173/s/tok' }).text;
    for (const t of [rx, lab]) {
      expect(t).toContain('http://localhost:5173/s/tok');
      expect(t.toLowerCase()).toContain('portal');
    }
  });

  it('every template has a provider template id and purpose', () => {
    for (const k of KEYS) {
      expect(TEMPLATES[k].whatsappTemplate).toMatch(/^[a-z_]+$/);
      expect(TEMPLATES[k].purpose).toMatch(/^[A-Z_]+$/);
    }
  });
});
