import { DashboardPageModel } from '../pages/dashboard/index';
import { ApiError } from '../src/api/client';
import type { AccountSummary, AiInsight, CategorySummary, DashboardSummary } from '../src/api/contracts';
import { ReadCache } from '../src/cache/read-cache';
import { SessionStore, type StorageLike } from '../src/auth/session-store';
import { LoginPageModel } from '../pages/login/index';
import { resolveInitialRoute } from '../app';

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();
  getStorageSync(key: string): unknown { return this.values.get(key); }
  setStorageSync(key: string, value: string): void { this.values.set(key, value); }
  removeStorageSync(key: string): void { this.values.delete(key); }
}

const summary: DashboardSummary = {
  netWorthMinor: 120_000,
  totalAssetsMinor: 150_000,
  initialAssetsMinor: 100_000,
  termDepositMinor: 50_000,
  incomeMinor: 300_000,
  expenseMinor: 180_000,
  categoryBreakdown: [],
  accountBreakdown: [],
  pendingDraftCount: 2,
  duplicateCount: 1,
  recurringDueCount: 3,
  recentTransactions: [],
};

const accounts: AccountSummary[] = [{ id: 'account-1', name: '日常账户', kind: 'asset', openingBalanceMinor: 0 }];
const categories: CategorySummary[] = [{ id: 'category-1', name: '餐饮', direction: 'expense' }];

test('routes an unauthenticated app to login and a successful Mock login to the dashboard', async () => {
  expect(resolveInitialRoute(null)).toBe('/pages/login/index');
  const storage = new MemoryStorage();
  const sessions = new SessionStore(storage);
  const navigate = jest.fn();
  const model = new LoginPageModel({ login: jest.fn().mockResolvedValue({
    accessToken: 'mock-a', refreshToken: 'mock-r', householdId: 'household-1', isNewUser: true,
  }) }, sessions, navigate);
  await expect(model.login()).resolves.toBe(true);
  expect(navigate).toHaveBeenCalledWith('/pages/dashboard/index');
  expect(resolveInitialRoute(sessions.read())).toBe('/pages/dashboard/index');
});

test('loads the household cockpit and exposes pending/duplicate/recurring counts', async () => {
  const api = {
    fetchSummary: jest.fn().mockResolvedValue(summary),
    fetchAccounts: jest.fn().mockResolvedValue(accounts),
    fetchCategories: jest.fn().mockResolvedValue(categories),
  };
  const model = new DashboardPageModel(api);
  await model.load({ from: '2026-08-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' });
  expect(model.state).toEqual(expect.objectContaining({
    summary,
    accounts,
    categories,
    pendingDraftCount: 2,
    duplicateCount: 1,
    recurringDueCount: 3,
    fromCache: false,
  }));
});

test('formats dashboard amounts before they reach the WXML template', async () => {
  const api = {
    fetchSummary: jest.fn().mockResolvedValue(summary),
    fetchAccounts: jest.fn().mockResolvedValue(accounts),
    fetchCategories: jest.fn().mockResolvedValue(categories),
  };
  const model = new DashboardPageModel(api);

  await model.load({ from: '2026-08-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' });

  expect(model.state).toEqual(expect.objectContaining({
    netWorthDisplay: 'NZ$1200.00',
    totalAssetsDisplay: 'NZ$1500.00',
    initialAssetsDisplay: 'NZ$1000.00',
    termDepositDisplay: 'NZ$500.00',
    incomeDisplay: 'NZ$3000.00',
    expenseDisplay: 'NZ$1800.00',
  }));
});

test('renders cached summary with a cache label after the API is unavailable', async () => {
  const storage = new MemoryStorage();
  const cache = new ReadCache(storage);
  const api = {
    fetchSummary: jest.fn().mockResolvedValue(summary),
    fetchAccounts: jest.fn().mockResolvedValue(accounts),
    fetchCategories: jest.fn().mockResolvedValue(categories),
  };
  const model = new DashboardPageModel(api, cache);
  await model.load({ from: '2026-08-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' });
  api.fetchSummary.mockRejectedValue(new ApiError(0, 'network', 'network unavailable'));
  await model.load({ from: '2026-08-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' });
  expect(model.state).toEqual(expect.objectContaining({ summary, fromCache: true, cacheLabel: '缓存数据' }));
});

test('dashboard cache is isolated by household', async () => {
  const storage = new MemoryStorage();
  const cache = new ReadCache(storage);
  const period = { from: '2026-08-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' };
  const firstApi = { fetchSummary: jest.fn().mockResolvedValue(summary), fetchAccounts: jest.fn().mockResolvedValue(accounts), fetchCategories: jest.fn().mockResolvedValue(categories) };
  await new DashboardPageModel(firstApi, cache, () => 'household-a').load(period);
  const secondApi = { fetchSummary: jest.fn().mockRejectedValue(new ApiError(0, 'network', 'offline')), fetchAccounts: jest.fn().mockRejectedValue(new ApiError(0, 'network', 'offline')), fetchCategories: jest.fn().mockRejectedValue(new ApiError(0, 'network', 'offline')) };
  const second = new DashboardPageModel(secondApi, cache, () => 'household-b');
  await second.load(period);
  expect(second.state.fromCache).toBe(false);
  expect(second.state.summary).toBeNull();
});

test('late dashboard request cannot clear the newer household state or loading', async () => {
  let household = 'household-a';
  let resolveFirst!: (value: DashboardSummary) => void;
  let resolveInsights!: (value: []) => void;
  const firstSummary = new Promise<DashboardSummary>((resolve) => { resolveFirst = resolve; });
  const pendingInsights = new Promise<[]>((resolve) => { resolveInsights = resolve; });
  const secondSummary = { ...summary, netWorthMinor: 220_000 };
  const api = {
    fetchSummary: jest.fn().mockImplementationOnce(() => firstSummary).mockResolvedValue(secondSummary),
    fetchAccounts: jest.fn().mockResolvedValue(accounts),
    fetchCategories: jest.fn().mockResolvedValue(categories),
    fetchAiInsights: jest.fn().mockReturnValue(pendingInsights),
  };
  const model = new DashboardPageModel(api, undefined, () => household);
  const firstLoad = model.load({ from: '2026-08-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' });
  household = 'household-b';
  const secondLoad = model.load({ from: '2026-08-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' });
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  expect(model.state.summary).toBe(secondSummary);
  expect(model.state.loading).toBe(true);

  resolveFirst(summary);
  await firstLoad;
  expect(model.state.summary).toBe(secondSummary);
  expect(model.state.loading).toBe(true);

  resolveInsights([]);
  await secondLoad;
  expect(model.state.loading).toBe(false);
});

test('late dashboard insight request cannot overwrite the newer household insights', async () => {
  let household = 'household-a';
  let resolveFirst!: (value: AiInsight[]) => void;
  const firstInsights = new Promise<AiInsight[]>((resolve) => { resolveFirst = resolve; });
  const oldInsight = { type: 'old', title: '旧家庭' };
  const newInsight = { type: 'new', title: '新家庭' };
  const api = {
    fetchSummary: jest.fn().mockResolvedValue(summary),
    fetchAccounts: jest.fn().mockResolvedValue(accounts),
    fetchCategories: jest.fn().mockResolvedValue(categories),
    fetchAiInsights: jest.fn().mockImplementationOnce(() => firstInsights).mockResolvedValue([newInsight]),
  };
  const model = new DashboardPageModel(api, undefined, () => household);
  const firstLoad = model.load({ from: '2026-08-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' });
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  household = 'household-b';
  await model.load({ from: '2026-08-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' });
  expect(model.state.insights).toEqual([newInsight]);

  resolveFirst([oldInsight]);
  await firstLoad;
  expect(model.state.insights).toEqual([newInsight]);
});

test('dashboard household cleanup resets every private display and marker', async () => {
  let household = 'household-a';
  let resolveRequest!: (value: DashboardSummary) => void;
  const pending = new Promise<DashboardSummary>((resolve) => { resolveRequest = resolve; });
  const api = {
    fetchSummary: jest.fn().mockReturnValue(pending),
    fetchAccounts: jest.fn().mockResolvedValue(accounts),
    fetchCategories: jest.fn().mockResolvedValue(categories),
  };
  const model = new DashboardPageModel(api, undefined, () => household);
  const load = model.load({ from: '2026-08-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' });
  Object.assign(model.state, {
    summary,
    accounts,
    categories,
    pendingDraftCount: 2,
    duplicateCount: 1,
    recurringDueCount: 3,
    recentTransactions: summary.recentTransactions,
    fromCache: true,
    cacheLabel: '缓存数据',
    netWorthDisplay: 'NZ$1200.00',
    totalAssetsDisplay: 'NZ$1500.00',
    initialAssetsDisplay: 'NZ$1000.00',
    termDepositDisplay: 'NZ$500.00',
    incomeDisplay: 'NZ$3000.00',
    expenseDisplay: 'NZ$1800.00',
    insights: [{ title: '旧家庭', detail: '旧数据', severity: 'info' }],
    insightsFromCache: true,
    error: '旧错误',
  });
  household = 'household-b';
  resolveRequest(summary);
  await load;
  expect(model.state).toEqual(expect.objectContaining({
    summary: null,
    accounts: [],
    categories: [],
    pendingDraftCount: 0,
    duplicateCount: 0,
    recurringDueCount: 0,
    recentTransactions: [],
    fromCache: false,
    cacheLabel: '',
    netWorthDisplay: '--',
    totalAssetsDisplay: '--',
    initialAssetsDisplay: '--',
    termDepositDisplay: '--',
    incomeDisplay: '--',
    expenseDisplay: '--',
    insights: [],
    insightsFromCache: false,
    error: '',
    loading: false,
  }));
});
