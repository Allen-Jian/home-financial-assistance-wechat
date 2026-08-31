import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CategorySettingsModel } from '../pages/settings/categories/index';
import { AssetSettingsModel } from '../pages/settings/assets/index';
import { TermDepositSettingsModel } from '../pages/settings/term-deposits/index';
import { createMorePage, MorePageModel } from '../pages/more/index';
import { THEME_STORAGE_KEY, ThemeRuntime, type ThemeNative } from '../src/shared/theme-runtime';
import type { StorageLike } from '../src/auth/session-store';
import { withThemePage } from '../src/shared/themed-page';

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();

  getStorageSync(key: string): unknown { return this.values.get(key); }
  setStorageSync(key: string, value: string): void { this.values.set(key, value); }
  removeStorageSync(key: string): void { this.values.delete(key); }
}

function createTheme(storage: StorageLike = new MemoryStorage()): ThemeRuntime {
  const native: ThemeNative = { getSystemTheme: () => 'light' };
  return new ThemeRuntime(storage, native);
}

const moreApi = { exportTransactions: jest.fn(), logout: jest.fn() };
const createMoreAppearancePage = createMorePage as unknown as (model: MorePageModel, theme: ThemeRuntime) => any;

test('category management deactivates without deleting history', async () => {
  const api = { updateCategory: jest.fn().mockResolvedValue({ id: 'c-1', active: false }) };
  await expect(new CategorySettingsModel(api).setActive('c-1', false)).resolves.toBe(true);
  expect(api.updateCategory).toHaveBeenCalledWith('c-1', { active: false });
});

test('category reload requests inactive records so a deactivated category can be re-enabled', async () => {
  let active = true;
  const api = {
    fetchCategories: jest.fn().mockImplementation((includeInactive?: boolean) => includeInactive || active ? [{ id: 'c-1', name: '餐饮', direction: 'expense' as const, active }] : []),
    updateCategory: jest.fn().mockImplementation((_id: string, input: { active?: boolean }) => {
      active = input.active ?? active;
      return Promise.resolve({ id: 'c-1', name: '餐饮', direction: 'expense' as const, active });
    }),
  };
  const model = new CategorySettingsModel(api);
  await model.load();
  await expect(model.setActive('c-1', false)).resolves.toBe(true);
  await model.load();
  expect(api.fetchCategories).toHaveBeenLastCalledWith(true);
  expect(model.state.categories).toEqual([{ id: 'c-1', name: '餐饮', direction: 'expense', active: false }]);
  await expect(model.setActive('c-1', true)).resolves.toBe(true);
  await model.load();
  expect(api.updateCategory).toHaveBeenLastCalledWith('c-1', { active: true });
  expect(model.state.categories).toEqual([{ id: 'c-1', name: '餐饮', direction: 'expense', active: true }]);
});

test('term-deposit creation calls metadata API only', async () => {
  const created = { id: 'td-1', name: '定存', principalMinor: 100000, annualRateBasisPoints: 375, startedAt: '2026-08-01', maturesAt: '2027-02-01', status: 'active' as const, version: 0 };
  const api = { createTermDeposit: jest.fn().mockResolvedValue(created) };
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

test('initial asset settings does not substitute an arbitrary asset account for PRIMARY', async () => {
  const api = {
    fetchAccounts: jest.fn().mockResolvedValue([{ id: 'a-2', name: '其他资产', kind: 'asset', openingBalanceMinor: 100 }]),
    setInitialAsset: jest.fn(),
  };
  const model = new AssetSettingsModel(api);
  await model.load();
  await expect(model.saveInitialAsset()).resolves.toBe(false);
  expect(model.state.primary).toBeNull();
  expect(api.setInitialAsset).not.toHaveBeenCalled();
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

test('term deposit list formats principal before rendering', async () => {
  const deposit = { id: 'td-1', name: '定存', principalMinor: 100000, annualRateBasisPoints: 375, startedAt: '2026-08-01', maturesAt: '2027-02-01', status: 'active' as const, version: 1 };
  const model = new TermDepositSettingsModel({ createTermDeposit: jest.fn(), fetchTermDeposits: jest.fn().mockResolvedValue([deposit]) });

  await model.load();

  expect(model.state.deposits[0]).toEqual(expect.objectContaining({ principalDisplay: 'NZ$1000.00', statusLabel: '存续中' }));
});

test('appearance selector exposes options in the approved fixed order', () => {
  const page = createMoreAppearancePage(new MorePageModel(moreApi), createTheme());

  expect((page.data as unknown as { appearanceOptions: Array<{ label: string; value: string }> }).appearanceOptions).toEqual([
    { label: '浅色', value: 'light' },
    { label: '深色', value: 'dark' },
    { label: '跟随系统', value: 'system' },
  ]);
});

test('appearance selection applies the theme immediately and clears a previous warning', () => {
  const theme = createTheme();
  const page = createMoreAppearancePage(new MorePageModel(moreApi), theme);
  const setData = jest.fn();

  page.onAppearanceSelect.call({ setData }, { currentTarget: { dataset: { value: 'dark' } } });

  expect(theme.getSnapshot()).toEqual(expect.objectContaining({ themePreference: 'dark', resolvedTheme: 'dark' }));
  expect(setData).toHaveBeenCalledWith(expect.objectContaining({
    themePreference: 'dark',
    resolvedTheme: 'dark',
    themePersistenceWarning: '',
  }));
});

test('appearance persistence failure keeps the session theme and shows a non-blocking warning', () => {
  const storage: StorageLike = {
    getStorageSync: () => undefined,
    setStorageSync: () => { throw new Error('storage unavailable'); },
    removeStorageSync: jest.fn(),
  };
  const theme = createTheme(storage);
  const page = createMoreAppearancePage(new MorePageModel(moreApi), theme);
  const setData = jest.fn();

  expect(() => page.onAppearanceSelect.call({ setData }, { currentTarget: { dataset: { value: 'dark' } } })).not.toThrow();

  expect(theme.getSnapshot().resolvedTheme).toBe('dark');
  expect(setData).toHaveBeenCalledWith(expect.objectContaining({
    themePersistenceWarning: '外观设置未能保存，下次打开可能恢复为跟随系统',
  }));
});

test.each([
  ['bogus value', { currentTarget: { dataset: { value: 'sepia' } } }],
  ['near-current value', { currentTarget: { dataset: { value: 'dark ' } } }],
  ['missing value', { currentTarget: { dataset: {} } }],
])('invalid appearance dataset %s has no side effects', (_caseName, event) => {
  const storage = new MemoryStorage();
  const theme = createTheme(storage);
  theme.setPreference('dark');
  const setPreference = jest.spyOn(theme, 'setPreference');
  const persistedBefore = storage.values.get(THEME_STORAGE_KEY);
  const page = createMoreAppearancePage(new MorePageModel(moreApi), theme);
  const setData = jest.fn();

  expect(() => page.onAppearanceSelect.call({ setData }, event)).not.toThrow();

  expect(theme.getSnapshot()).toEqual(expect.objectContaining({ themePreference: 'dark', resolvedTheme: 'dark' }));
  expect(storage.values.get(THEME_STORAGE_KEY)).toBe(persistedBefore);
  expect(setPreference).not.toHaveBeenCalled();
  expect(setData).not.toHaveBeenCalled();
});

test('production more page keeps stored initial appearance after theme wrapping', () => {
  const storage = new MemoryStorage();
  storage.values.set(THEME_STORAGE_KEY, JSON.stringify('dark'));
  const theme = createTheme(storage);
  const page = createMoreAppearancePage(new MorePageModel(moreApi), theme);
  const wrapped = withThemePage(page, theme);

  expect(wrapped.data).toEqual(expect.objectContaining({ themePreference: 'dark', resolvedTheme: 'dark' }));
});

function appearanceSection(wxml: string): string {
  const source = wxml.replace(/<!--[\s\S]*?-->/g, '');
  const start = source.indexOf('class="settings-row static appearance-row"');
  const end = source.indexOf('<navigator url="/pages/reports/index"', start);
  if (start < 0 || end <= start) throw new Error('appearance section is missing');
  return source.slice(start, end);
}

function assertAppearanceSelectorMarkup(wxml: string): void {
  const section = appearanceSection(wxml);
  const controlStart = section.indexOf('<view class="appearance-control">');
  const selectorStart = section.indexOf('<view class="appearance-selector">', controlStart);
  const warningNode = '<text wx:if="{{themePersistenceWarning}}" class="theme-persistence-warning">{{themePersistenceWarning}}</text>';
  const warningStart = section.indexOf(warningNode);
  const controlEnd = warningStart < 0 ? -1 : section.indexOf('</view>', warningStart);
  if (controlStart < 0 || selectorStart < 0 || warningStart < 0 || warningStart <= controlStart || controlEnd <= warningStart) {
    throw new Error('appearance selector warning structure is missing');
  }
  if (warningStart <= selectorStart) throw new Error('appearance warning must follow selector');
  const selectorEnd = section.indexOf('</view><text wx:if="{{themePersistenceWarning}}"', selectorStart);
  if (selectorEnd < 0 || warningStart <= selectorEnd) throw new Error('appearance warning is not after selector');
  if (section.includes('<navigator')) throw new Error('appearance selector must be inline');
  expect(section).toContain('wx:for="{{appearanceOptions}}"');
  expect(section).toContain('bindtap="onAppearanceSelect"');
  expect(section).toContain('data-value="{{item.value}}"');
  expect(section).toContain("themePreference === item.value ? 'selected' : ''");
}

test('appearance selector markup is structural and comment-safe', () => {
  const wxml = readFileSync(resolve(__dirname, '../pages/more/index.wxml'), 'utf8');
  expect(() => assertAppearanceSelectorMarkup(wxml)).not.toThrow();

  const warningNode = '<text wx:if="{{themePersistenceWarning}}" class="theme-persistence-warning">{{themePersistenceWarning}}</text>';
  const mutated = wxml.replace(warningNode, '<!-- removed warning -->');
  expect(() => assertAppearanceSelectorMarkup(mutated)).toThrow();
});
