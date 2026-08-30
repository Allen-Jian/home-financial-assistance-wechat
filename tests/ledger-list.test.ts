import { LedgerListPageModel } from '../pages/ledger/index';
import { getPeriodBounds } from '../src/domain/period';

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
