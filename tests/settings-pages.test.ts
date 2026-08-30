import { CategorySettingsModel } from '../pages/settings/categories/index';
import { AssetSettingsModel } from '../pages/settings/assets/index';
import { TermDepositSettingsModel } from '../pages/settings/term-deposits/index';

test('category management deactivates without deleting history', async () => {
  const api = { updateCategory: jest.fn().mockResolvedValue({ id: 'c-1', active: false }) };
  await expect(new CategorySettingsModel(api).setActive('c-1', false)).resolves.toBe(true);
  expect(api.updateCategory).toHaveBeenCalledWith('c-1', { active: false });
});

test('term-deposit creation calls metadata API only', async () => {
  const api = { createTermDeposit: jest.fn().mockResolvedValue({ id: 'td-1', status: 'active' }) };
  await expect(new TermDepositSettingsModel(api).create({ name: '定存', principalMinor: 100000, annualRateBasisPoints: 375, startedAt: '2026-08-01', maturesAt: '2027-02-01' })).resolves.toBe(true);
  expect(api.createTermDeposit).toHaveBeenCalledTimes(1);
});

test('initial asset save uses the primary account version for the audited update', async () => {
  const api = {
    fetchAccounts: jest.fn().mockResolvedValue([{ id: 'a-1', name: '家庭资产', kind: 'asset', openingBalanceMinor: 0, systemKey: 'PRIMARY', version: 4 }]),
    setInitialAsset: jest.fn().mockResolvedValue({ id: 'a-1', openingBalanceMinor: 12500, version: 5 }),
  };
  const model = new AssetSettingsModel(api);
  await expect(model.load()).resolves.toBeUndefined();
  model.setAmount('125.00');
  await expect(model.saveInitialAsset()).resolves.toBe(true);
  expect(api.setInitialAsset).toHaveBeenCalledWith(12500, 4);
});

test('closing a term deposit sends the expected version and updates its status', async () => {
  const api = {
    createTermDeposit: jest.fn(),
    closeTermDeposit: jest.fn().mockResolvedValue({ id: 'td-1', status: 'closed', version: 2 }),
  };
  const model = new TermDepositSettingsModel(api);
  model.state.deposits = [{ id: 'td-1', name: '定存', principalMinor: 100000, annualRateBasisPoints: 375, startedAt: '2026-08-01', maturesAt: '2027-02-01', status: 'active', version: 1 }];
  await expect(model.close('td-1', 1)).resolves.toBe(true);
  expect(api.closeTermDeposit).toHaveBeenCalledWith('td-1', 1);
  expect(model.state.deposits[0].status).toBe('closed');
});
