import { LedgerListPageModel } from '../pages/ledger/index';
import { getPeriodBounds } from '../src/domain/period';
import { ReadCache } from '../src/cache/read-cache';
import { ApiError } from '../src/api/client';

test('ledger defaults to Auckland month and accepts a custom range', async () => {
  const api = { fetchTransactions: jest.fn().mockResolvedValue([]) };
  const model = new LedgerListPageModel(api, () => new Date('2026-08-20T00:00:00Z'));

  await model.load(model.currentPeriod());

  const bounds = getPeriodBounds(new Date('2026-08-20T00:00:00Z'), 'month');
  expect(api.fetchTransactions).toHaveBeenCalledWith({ from: '2026-08-01T00:00:00+12:00', to: '2026-09-01T00:00:00+12:00' });
  model.setPeriod('custom', '2026-01-01', '2026-03-31');
  expect(model.state.period.from).toBe('2026-01-01');
  expect(model.state.period.to).toBe('2026-03-31');
});

test('ledger formats read-only transactions and exposes a selected detail', async () => {
  const transaction = {
    id: 'tx-1', accountId: 'primary', direction: 'expense' as const, amountMinor: 8640,
    occurredAt: '2026-08-15T00:00:00.000Z', merchant: '超市', note: '家庭采购', version: 1,
  };
  const model = new LedgerListPageModel({ fetchTransactions: jest.fn().mockResolvedValue([transaction]) });

  await model.load(model.currentPeriod());
  expect(model.state.transactions[0]).toEqual(expect.objectContaining({ amountDisplay: 'NZ$86.40', merchant: '超市' }));
  model.selectTransaction('tx-1');
  expect(model.state.selectedTransaction).toEqual(transaction);
});

test('custom dates use Auckland day boundaries and month navigation', () => {
  const model = new LedgerListPageModel({ fetchTransactions: jest.fn().mockResolvedValue([]) }, () => new Date('2026-08-20T00:00:00Z'));
  model.setPeriod('custom', '2026-01-01', '2026-01-31');
  expect(model.currentPeriod().from).toMatch(/2025-12-31T11:00:00\.000Z|2025-12-31T12:00:00\.000Z/);
  expect(model.currentPeriod().to).toMatch(/2026-01-31T11:00:00\.000Z|2026-01-31T12:00:00\.000Z/);
  model.setPeriod('month');
  const next = model.shiftMonth(1);
  expect(next.from).toMatch(/2026-09-01T11:00:00\.000Z|2026-08-31T12:00:00\.000Z/);
});

test('custom Auckland boundaries handle daylight-saving transitions', () => {
  const model = new LedgerListPageModel({ fetchTransactions: jest.fn().mockResolvedValue([]) });
  model.setPeriod('custom', '2026-09-27', '2026-09-27');
  expect(model.currentPeriod().from).toBe('2026-09-26T12:00:00.000Z');
  model.setPeriod('custom', '2026-04-05', '2026-04-05');
  expect(model.currentPeriod().from).toBe('2026-04-04T11:00:00.000Z');
});

test('ledger cache is isolated by household', async () => {
  const values = new Map<string, string>();
  const storage = { getStorageSync: (key: string) => values.get(key), setStorageSync: (key: string, value: string) => values.set(key, value), removeStorageSync: (key: string) => values.delete(key) };
  const cache = new ReadCache(storage, () => 1_000);
  const period = { from: '2026-08-01T00:00:00Z', to: '2026-09-01T00:00:00Z' };
  const first = new LedgerListPageModel({ fetchTransactions: jest.fn().mockResolvedValue([{ id: 'a', accountId: 'p', direction: 'expense', amountMinor: 100, occurredAt: period.from, version: 0 }]) }, () => new Date(), cache, () => 'house-a');
  await first.load(period);
  const second = new LedgerListPageModel({ fetchTransactions: jest.fn().mockRejectedValue(new ApiError(0, 'network', 'offline')) }, () => new Date(), cache, () => 'house-b');
  await second.load(period);
  expect(second.state.transactions).toEqual([]);
});
