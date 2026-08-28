import { DashboardPageModel } from '../pages/dashboard/index';
import { ApiError } from '../src/api/client';
import type { AccountSummary, CategorySummary, DashboardSummary } from '../src/api/contracts';
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
