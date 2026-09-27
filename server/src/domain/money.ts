/** Money helpers using integer paise — never floating point. */
export const toPaise = (amount: string | number | { toString(): string }): number => {
  const s = String(amount).trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new Error(`Invalid amount: ${s}`);
  const [whole = '0', frac = ''] = s.replace('-', '').split('.');
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return s.startsWith('-') ? -paise : paise;
};

export const fromPaise = (p: number): string => {
  const sign = p < 0 ? '-' : '';
  const abs = Math.abs(p);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
};

/** Tax on a paise amount at a percentage rate (2 decimals), rounded half-up to the paisa. */
export const taxOn = (paise: number, ratePct: string | number): number => Math.round((paise * toPaise(ratePct)) / 10_000);

export interface LineInput {
  quantity: number;
  unitPrice: string;
  discount: string;
  taxRatePct: string;
}

export function computeInvoice(lines: LineInput[], invoiceDiscount = '0') {
  let subtotal = 0;
  let tax = 0;
  const computed = lines.map((l) => {
    const gross = toPaise(l.unitPrice) * l.quantity;
    const net = Math.max(0, gross - toPaise(l.discount));
    const lineTax = taxOn(net, l.taxRatePct);
    subtotal += gross;
    tax += lineTax;
    return { ...l, amount: fromPaise(net + lineTax), netPaise: net };
  });
  // A line discount can never exceed the line's gross amount (the excess is not a discount).
  const lineDiscounts = computed.reduce((s, l, i) => s + (toPaise(lines[i]!.unitPrice) * lines[i]!.quantity - l.netPaise), 0);
  const netAfterLines = subtotal - lineDiscounts;
  const discount = lineDiscounts + Math.min(toPaise(invoiceDiscount), netAfterLines);
  const total = Math.max(0, subtotal - discount + tax);
  return { lines: computed, subtotal: fromPaise(subtotal), discount: fromPaise(discount), tax: fromPaise(tax), total: fromPaise(total) };
}
