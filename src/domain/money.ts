export function formatNzdMinor(minor: number): string {
  if (!Number.isSafeInteger(minor)) throw new Error('amount must be a safe integer');
  const sign = minor < 0 ? '-' : '';
  const absolute = Math.abs(minor);
  return `${sign}NZ$${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}

export function parseNzdMinor(input: string): number {
  const value = input.trim();
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('amount must be NZD with up to two decimals');
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ''] = unsigned.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor)) throw new Error('amount is too large');
  return negative ? -minor : minor;
}
