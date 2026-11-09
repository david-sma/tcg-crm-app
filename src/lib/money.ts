/** Money helpers for manager-entered prices (stored as integer cents). */

/** "$1,250.00" (or "—" when unpriced). */
export function formatCents(cents: number | null | undefined, empty = '—'): string {
  if (cents === null || cents === undefined) return empty;
  return new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(cents / 100);
}

/** Value for an amount input: 1250 cents → "12.50", 125000 → "1250". */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/** True when the input is empty or a valid amount like 450, 450.5, $1,250.00. */
export function isValidAmountInput(value: string): boolean {
  const text = value.replace(/[\s$,]/g, '');
  return text === '' || /^\d+(\.\d{1,2})?$/.test(text);
}

/** Normalised amount for comparing an input against stored cents. */
export function amountInputToCents(value: string): number | null {
  const text = value.replace(/[\s$,]/g, '');
  if (text === '' || !/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
