import { describe, expect, it } from 'vitest';
import { toCsv } from '../../src/services/report.service.js';

const parseFirstRow = (csv: string) => csv.split('\n')[1];

describe('toCsv', () => {
  it('returns empty string for no rows', () => expect(toCsv([])).toBe(''));

  it('writes a header and rows', () => {
    expect(toCsv([{ a: 1, b: 'x' }, { a: 2, b: null }])).toBe('a,b\n1,x\n2,');
  });

  it.each(['=1+1', '+SUM(A1:A2)', '-2+3', '@cmd', '\t=1', '\r=1'])('neutralises formula-looking value %j', (v) => {
    const cell = parseFirstRow(toCsv([{ v }])) ?? '';
    const unquoted = cell.startsWith('"') ? cell.slice(1, -1) : cell;
    expect(unquoted.startsWith("'")).toBe(true);
  });

  it('neutralises formulas that also need quoting', () => {
    expect(toCsv([{ v: '=HYPERLINK("http://x","y")' }])).toBe('v\n"\'=HYPERLINK(""http://x"",""y"")"');
  });

  it('quotes commas, quotes and line breaks (including bare CR) so rows cannot be injected', () => {
    expect(toCsv([{ v: 'a,b' }])).toBe('v\n"a,b"');
    expect(toCsv([{ v: 'say "hi"' }])).toBe('v\n"say ""hi"""');
    expect(toCsv([{ v: 'line1\nline2' }])).toBe('v\n"line1\nline2"');
    expect(toCsv([{ v: 'line1\r=cmd' }])).toBe('v\n"line1\r=cmd"');
  });

  it('leaves ordinary values untouched', () => {
    expect(toCsv([{ n: 'APT-2026-000001', d: '2026-09-26T03:30:00.000Z', ok: true }])).toBe('n,d,ok\nAPT-2026-000001,2026-09-26T03:30:00.000Z,true');
  });
});
