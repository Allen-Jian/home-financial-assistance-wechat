export type PeriodKind = 'month' | 'quarter' | 'year';
export interface PeriodBounds {
  from: Date;
  to: Date;
}

const AUCKLAND = 'Pacific/Auckland';

function localDateParts(value: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: AUCKLAND,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read('year'), month: read('month'), day: read('day') };
}

function aucklandMidnightUtc(year: number, month: number, day: number): Date {
  const target = Date.UTC(year, month - 1, day);
  let guess = target;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: AUCKLAND,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = formatter.formatToParts(new Date(guess));
    const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const observed = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour'), read('minute'), read('second'));
    const next = target - (observed - guess);
    if (next === guess) return new Date(next);
    guess = next;
  }
  return new Date(guess);
}

export function getPeriodBounds(value: Date, kind: PeriodKind): PeriodBounds {
  if (Number.isNaN(value.valueOf())) throw new Error('date is invalid');
  const { year, month } = localDateParts(value);
  const startMonth = kind === 'year' ? 1 : kind === 'quarter' ? Math.floor((month - 1) / 3) * 3 + 1 : month;
  const endYear = kind === 'year' ? year + 1 : startMonth + (kind === 'quarter' ? 3 : 1) > 12 ? year + 1 : year;
  const endMonth = kind === 'year' ? 1 : ((startMonth + (kind === 'quarter' ? 3 : 1) - 1) % 12) + 1;
  return {
    from: aucklandMidnightUtc(year, startMonth, 1),
    to: aucklandMidnightUtc(endYear, endMonth, 1),
  };
}
