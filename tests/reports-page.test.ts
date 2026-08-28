import { ReportPageModel } from '../pages/reports/index';
import { RecurringPageModel } from '../pages/recurring/index';

const report = { from: '2026-08-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z', netWorthMinor: 1000, incomeMinor: 2000, expenseMinor: 1000, categoryBreakdown: [], accountBreakdown: [] };

test('uses Auckland month, quarter, and year query boundaries', async () => {
  const api = { fetchReports: jest.fn().mockResolvedValue(report), exportTransactions: jest.fn() };
  const model = new ReportPageModel(api);
  const anchor = new Date('2026-08-15T00:00:00.000Z');
  await model.load('month', anchor);
  expect(api.fetchReports).toHaveBeenLastCalledWith({ from: '2026-07-31T12:00:00.000Z', to: '2026-08-31T12:00:00.000Z' });
  await model.load('quarter', anchor);
  expect(api.fetchReports).toHaveBeenLastCalledWith({ from: '2026-06-30T12:00:00.000Z', to: '2026-09-30T11:00:00.000Z' });
  await model.load('year', anchor);
  expect(api.fetchReports).toHaveBeenLastCalledWith({ from: '2025-12-31T11:00:00.000Z', to: '2026-12-31T11:00:00.000Z' });
});

test('drills into a category while preserving the selected period and hands off UTF-8 exports', async () => {
  const api = { fetchReports: jest.fn().mockResolvedValue(report), exportTransactions: jest.fn().mockResolvedValue('\ufeffdate,amount') };
  const model = new ReportPageModel(api);
  await model.load('month', new Date('2026-08-15T00:00:00.000Z'));
  await model.drillDownCategory('餐饮');
  const period = { from: '2026-07-31T12:00:00.000Z', to: '2026-08-31T12:00:00.000Z' };
  expect(api.fetchReports).toHaveBeenLastCalledWith({ ...period, category: '餐饮' });
  await expect(model.export('csv')).resolves.toBe('\ufeffdate,amount');
  expect(api.exportTransactions).toHaveBeenCalledWith(period, 'csv');
});

test('recurring templates remind and advance without creating a transaction', async () => {
  const api = {
    fetchRecurring: jest.fn().mockResolvedValue([{ id: 'r-1', name: '电费', direction: 'expense', amountMinor: 9000, accountId: 'a-1', dayOfMonth: 15, nextDueAt: '2026-09-15T00:00:00.000Z', active: true }]),
    createRecurring: jest.fn().mockResolvedValue({ id: 'r-2' }),
    advanceRecurring: jest.fn().mockResolvedValue({ id: 'r-1', nextDueAt: '2026-10-15T00:00:00.000Z' }),
    createTransaction: jest.fn(),
  };
  const model = new RecurringPageModel(api);
  await model.load();
  expect(model.state.dueCount).toBe(1);
  await expect(model.advance('r-1')).resolves.toBe(true);
  expect(api.advanceRecurring).toHaveBeenCalledWith('r-1');
  expect(api.createTransaction).not.toHaveBeenCalled();
});
