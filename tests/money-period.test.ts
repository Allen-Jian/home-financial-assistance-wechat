import { formatNzdMinor, parseNzdMinor } from '../src/domain/money';
import { getPeriodBounds } from '../src/domain/period';

test('formats NZ cents and keeps a negative sign before the currency', () => {
  expect(formatNzdMinor(8640)).toBe('NZ$86.40');
  expect(formatNzdMinor(-1250)).toBe('-NZ$12.50');
});

test('parses decimal NZD input into integer cents', () => {
  expect(parseNzdMinor('86.40')).toBe(8640);
  expect(parseNzdMinor('0.5')).toBe(50);
});

test('returns Auckland month, quarter, and year boundaries as UTC instants', () => {
  const sample = new Date('2026-08-15T00:00:00.000Z');
  expect(getPeriodBounds(sample, 'month')).toEqual({
    from: new Date('2026-07-31T12:00:00.000Z'),
    to: new Date('2026-08-31T12:00:00.000Z'),
  });
  expect(getPeriodBounds(sample, 'quarter')).toEqual({
    from: new Date('2026-06-30T12:00:00.000Z'),
    to: new Date('2026-09-30T11:00:00.000Z'),
  });
  expect(getPeriodBounds(sample, 'year')).toEqual({
    from: new Date('2025-12-31T11:00:00.000Z'),
    to: new Date('2026-12-31T11:00:00.000Z'),
  });
});
