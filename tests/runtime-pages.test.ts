import { createDashboardPage } from '../pages/dashboard/index';
import { createLedgerPage } from '../pages/ledger/index';
import { DashboardPageModel } from '../pages/dashboard/index';
import { LedgerPageModel } from '../pages/ledger/index';
import { HouseholdPageModel, createHouseholdPage } from '../pages/household/index';

type Context = { setData: jest.Mock };

test('dashboard runtime page loads the current period on show and syncs data', async () => {
  const api = {
    fetchSummary: jest.fn().mockResolvedValue({ netWorthMinor: 0, incomeMinor: 0, expenseMinor: 0, categoryBreakdown: [], accountBreakdown: [] }),
    fetchAccounts: jest.fn().mockResolvedValue([]),
    fetchCategories: jest.fn().mockResolvedValue([]),
  };
  const model = new DashboardPageModel(api);
  const page = createDashboardPage(model, () => ({ from: '2026-08-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' }));
  const context: Context = { setData: jest.fn() };

  await page.onShow.call(context);

  expect(api.fetchSummary).toHaveBeenCalledWith({ from: '2026-08-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' });
  expect(context.setData).toHaveBeenCalledWith(model.state);
});

test('ledger runtime page forwards input and save events to the model', async () => {
  const api = { createTransaction: jest.fn().mockResolvedValue({ id: 'tx-1' }) };
  const model = new LedgerPageModel(api, () => 'idem-1');
  const page = createLedgerPage(model);
  const context: Context = { setData: jest.fn() };

  page.setAccounts([{ id: 'account-1', name: '日常账户', kind: 'asset', openingBalanceMinor: 0 }]);
  page.onAmountInput.call(context, { detail: { value: '12.50' } });
  page.onAccountChange.call(context, { detail: { value: 0 } });
  await page.save.call(context);

  expect(api.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 1250, accountId: 'account-1' }));
  expect(context.setData).toHaveBeenCalledWith(model.state);
});

test('ledger runtime page opens the receipt import flow', () => {
  const model = new LedgerPageModel({ createTransaction: jest.fn() });
  const page = createLedgerPage(model);
  const navigateTo = jest.fn();
  (globalThis as { wx?: unknown }).wx = { navigateTo };

  page.openImports();

  expect(navigateTo).toHaveBeenCalledWith({ url: '/pages/imports/index' });
});

test('household runtime page does not show removal confirmation for a member', () => {
  const model = new HouseholdPageModel({
    fetchMembers: jest.fn(), createInvite: jest.fn(), removeMember: jest.fn(),
  }, 'member', jest.fn());
  model.state.members = [{ membershipId: 'm-1', userId: 'u-1', username: '家人', role: 'member', createdAt: '' }];
  const page = createHouseholdPage(model);
  const showModal = jest.fn();
  (globalThis as { wx?: unknown }).wx = { showModal };

  page.remove.call({ setData: jest.fn() }, { currentTarget: { dataset: { id: 'm-1' } } });

  expect(showModal).not.toHaveBeenCalled();
});
