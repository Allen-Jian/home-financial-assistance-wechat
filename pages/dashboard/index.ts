import type { AccountSummary, CategorySummary, DashboardSummary } from '../../src/api/contracts';
import { ApiError } from '../../src/api/client';
import { ReadCache } from '../../src/cache/read-cache';

declare const wx: { navigateTo(options: { url: string }): void };

export interface PeriodQuery { from: string; to: string }
export interface DashboardApiPort {
  fetchSummary(period: PeriodQuery): Promise<DashboardSummary>;
  fetchAccounts(): Promise<AccountSummary[]>;
  fetchCategories(): Promise<CategorySummary[]>;
}

export interface DashboardState {
  loading: boolean;
  error: string;
  summary: DashboardSummary | null;
  accounts: AccountSummary[];
  categories: CategorySummary[];
  pendingDraftCount: number;
  duplicateCount: number;
  recurringDueCount: number;
  recentTransactions: DashboardSummary['recentTransactions'];
  fromCache: boolean;
  cacheLabel: string;
}

const CACHE_TTL = 5 * 60_000;

export class DashboardPageModel {
  state: DashboardState = {
    loading: false, error: '', summary: null, accounts: [], categories: [],
    pendingDraftCount: 0, duplicateCount: 0, recurringDueCount: 0, recentTransactions: [],
    fromCache: false, cacheLabel: '',
  };

  constructor(private readonly api: DashboardApiPort, private readonly cache?: ReadCache) {}

  async load(period: PeriodQuery): Promise<void> {
    const cacheKey = `dashboard:${period.from}:${period.to}`;
    this.state.loading = true;
    this.state.error = '';
    try {
      const [summary, accounts, categories] = await Promise.all([
        this.api.fetchSummary(period), this.api.fetchAccounts(), this.api.fetchCategories(),
      ]);
      this.applySummary(summary, false);
      this.state.accounts = accounts;
      this.state.categories = categories;
      this.cache?.set(cacheKey, summary);
    } catch (error) {
      const cached = error instanceof ApiError && (error.code === 'network' || error.code === 'timeout')
        ? this.cache?.read<DashboardSummary>(cacheKey, CACHE_TTL)
        : null;
      if (cached) {
        this.applySummary(cached.data, true);
      } else {
        this.state.error = error instanceof Error ? error.message : '加载驾驶舱失败';
      }
    } finally {
      this.state.loading = false;
    }
  }

  private applySummary(summary: DashboardSummary, fromCache: boolean): void {
    this.state.summary = summary;
    this.state.pendingDraftCount = summary.pendingDraftCount ?? 0;
    this.state.duplicateCount = summary.duplicateCount ?? 0;
    this.state.recurringDueCount = summary.recurringDueCount ?? 0;
    this.state.recentTransactions = summary.recentTransactions ?? [];
    this.state.fromCache = fromCache;
    this.state.cacheLabel = fromCache ? '缓存数据' : '';
  }
}

declare function Page(options: Record<string, unknown>): void;
if (typeof Page !== 'undefined') {
  Page({
    data: {
      loading: false, error: '', summary: null, pendingDraftCount: 0, duplicateCount: 0,
      recurringDueCount: 0, recentTransactions: [], fromCache: false, cacheLabel: '',
    },
    onQuickEntry() { wx.navigateTo({ url: '/pages/ledger/index' }); },
  });
}
