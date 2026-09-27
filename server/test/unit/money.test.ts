import { describe, expect, it } from 'vitest';
import { computeInvoice, fromPaise, taxOn, toPaise } from '../../src/domain/money.js';

describe('toPaise / fromPaise', () => {
  it.each([
    ['0', 0],
    ['1', 100],
    ['1.5', 150],
    ['1.05', 105],
    ['500.00', 50000],
    ['0.01', 1],
    ['-12.34', -1234],
    ['9999999999.99', 999999999999],
  ])('toPaise(%s) = %d', (s, p) => expect(toPaise(s)).toBe(p));

  it('accepts numbers and Decimal-like objects via toString', () => {
    expect(toPaise(12.5)).toBe(1250);
    expect(toPaise({ toString: () => '7.20' })).toBe(720);
  });

  it.each(['1.234', 'abc', '', '1,000', '1e3', '0.1.2', ' . '])('rejects %j', (s) => {
    expect(() => toPaise(s)).toThrow(/Invalid amount/);
  });

  it('never goes through float arithmetic (0.1 + 0.2 style inputs are rejected, not rounded)', () => {
    expect(() => toPaise(0.1 + 0.2)).toThrow();
    expect(toPaise('0.10') + toPaise('0.20')).toBe(30);
  });

  it.each([
    [0, '0.00'],
    [5, '0.05'],
    [150, '1.50'],
    [50000, '500.00'],
    [-1234, '-12.34'],
  ])('fromPaise(%d) = %s', (p, s) => expect(fromPaise(p)).toBe(s));

  it('round-trips', () => {
    for (const s of ['0.00', '0.99', '12.30', '100000.01']) expect(fromPaise(toPaise(s))).toBe(s);
  });
});

describe('taxOn', () => {
  it('rounds half-up to the paisa', () => {
    expect(taxOn(25000, '18')).toBe(4500);
    expect(taxOn(1, '18')).toBe(0); // 0.18 paise
    expect(taxOn(3, '18')).toBe(1); // 0.54 → 1
    expect(taxOn(25, '2')).toBe(1); // 0.5 → 1 (half-up)
    expect(taxOn(10000, '12.5')).toBe(1250);
    expect(taxOn(333, '5')).toBe(17); // 16.65 → 17
  });
});

describe('computeInvoice', () => {
  it('sums lines with quantity, tax and discount', () => {
    const r = computeInvoice([
      { quantity: 1, unitPrice: '500.00', discount: '0', taxRatePct: '0' },
      { quantity: 2, unitPrice: '250.00', discount: '50.00', taxRatePct: '18' },
    ]);
    expect(r.subtotal).toBe('1000.00');
    expect(r.discount).toBe('50.00');
    expect(r.tax).toBe('81.00'); // 18% of 450
    expect(r.total).toBe('1031.00');
    expect(r.lines.map((l) => l.amount)).toEqual(['500.00', '531.00']);
  });

  it('rounds tax per line (paise) and never uses floats', () => {
    const r = computeInvoice([
      { quantity: 3, unitPrice: '0.10', discount: '0', taxRatePct: '18' }, // 30 paise → 5.4 → 5
      { quantity: 1, unitPrice: '0.03', discount: '0', taxRatePct: '18' }, // 3 → 0.54 → 1
    ]);
    expect(r.tax).toBe('0.06');
    expect(r.total).toBe('0.39');
  });

  it('applies an invoice-level discount after tax', () => {
    const r = computeInvoice([{ quantity: 1, unitPrice: '1000', discount: '0', taxRatePct: '0' }], '100.50');
    expect(r.discount).toBe('100.50');
    expect(r.total).toBe('899.50');
  });

  it('caps a line discount at the line gross amount', () => {
    const r = computeInvoice([
      { quantity: 1, unitPrice: '100.00', discount: '150.00', taxRatePct: '0' },
      { quantity: 1, unitPrice: '200.00', discount: '0', taxRatePct: '0' },
    ]);
    expect(r.lines[0]?.amount).toBe('0.00');
    expect(r.discount).toBe('100.00');
    expect(r.total).toBe('200.00');
  });

  it('never produces a negative total or a discount above the goods value', () => {
    const r = computeInvoice([{ quantity: 1, unitPrice: '100', discount: '0', taxRatePct: '0' }], '500');
    expect(r.total).toBe('0.00');
    expect(r.discount).toBe('100.00');
  });

  it('handles an empty-tax zero-price line', () => {
    const r = computeInvoice([{ quantity: 5, unitPrice: '0', discount: '0', taxRatePct: '18' }]);
    expect(r).toMatchObject({ subtotal: '0.00', tax: '0.00', total: '0.00', discount: '0.00' });
  });
});
