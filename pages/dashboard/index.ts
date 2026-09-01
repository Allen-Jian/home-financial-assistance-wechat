import type { AccountSummary, AiInsight, CategorySummary, DashboardSummary, TransactionSummary } from '../../src/api/contracts';
import { ApiError } from '../../src/api/client';
import { ReadCache } from '../../src/cache/read-cache';
import { getRuntime } from '../../app';
import { getPeriodBounds } from '../../src/domain/period';
import { formatNzdMinor } from '../../src/domain/money';
import { withThemePage } from '../../src/shared/themed-page';

declare const wx: {
  navigateTo(options: { url: string }): void;
  switchTab(options: { url: string }): void;
};

export interface PeriodQuery { from: string; to: string }
export interface DashboardRecentTransaction extends TransactionSummary {
  amountDisplay: string;
  dateDisplay: string;
  directionLabel: string;
}
export interface DashboardApiPort {
  fetchSummary(period: PeriodQuery): Promise<DashboardSummary>;
  fetchAccounts(): Promise<AccountSummary[]>;
  fetchCategories(): Promise<CategorySummary[]>;
  fetchAiInsights?: () => Promise<AiInsight[]>;
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
  recentTransactions: DashboardRecentTransaction[];
  fromCache: boolean;
  cacheLabel: string;
  netWorthDisplay: string;
  totalAssetsDisplay: string;
  initialAssetsDisplay: string;
  termDepositDisplay: string;
  incomeDisplay: string;
  expenseDisplay: string;
  insights: AiInsight[];
  insightsFromCache: boolean;
}

interface PageContext {
  setData(data: unknown): void;
  getTabBar?(): { setData(data: { selected: number }): void } | undefined;
}

const CACHE_TTL = 5 * 60_000;

function recentTransaction(transaction: TransactionSummary): DashboardRecentTransaction {
  const amount = formatNzdMinor(transaction.amountMinor);
  const expense = transaction.direction === 'expense';
  const date = new Date(transaction.occurredAt);
  const dateDisplay = Number.isNaN(date.valueOf()) ? transaction.occurredAt : new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Pacific/Auckland', month: 'numeric', day: 'numeric',
  }).format(date);
  return {
    ...transaction,
    amountDisplay: `${expense ? '−' : '+'} ${amount}`,
    dateDisplay,
    directionLabel: expense ? '支出' : transaction.direction === 'income' ? '收入' : '调整',
  };
}

export class DashboardPageModel {
  private requestGeneration = 0;

  state: DashboardState = {
    loading: false, error: '', summary: null, accounts: [], categories: [],
    pendingDraftCount: 0, duplicateCount: 0, recurringDueCount: 0, recentTransactions: [],
    fromCache: false, cacheLabel: '', netWorthDisplay: '--', totalAssetsDisplay: '--', initialAssetsDisplay: '--', termDepositDisplay: '--', incomeDisplay: '--', expenseDisplay: '--', insights: [], insightsFromCache: false,
  };

  constructor(private readonly api: DashboardApiPort, private readonly cache?: ReadCache, private readonly householdId: () => string = () => 'anonymous') {}

  async load(period: PeriodQuery): Promise<void> {
    const generation = ++this.requestGeneration;
    const scope = this.householdId();
    const cacheKey = `dashboard:${scope}:${period.from}:${period.to}`;
    this.state.loading = true;
    this.state.error = '';
    try {
      const [summary, accounts, categories] = await Promise.all([
        this.api.fetchSummary(period), this.api.fetchAccounts(), this.api.fetchCategories(),
      ]);
      if (generation !== this.requestGeneration) return;
      if (scope !== this.householdId()) { this.clearPrivateState(); return; }
      this.applySummary(summary, false);
      this.state.accounts = accounts;
      this.state.categories = categories;
      this.cache?.set(cacheKey, summary);
      await this.loadInsights(scope, generation);
    } catch (error) {
      if (generation !== this.requestGeneration) return;
      if (scope !== this.householdId()) { this.clearPrivateState(); return; }
      const cached = error instanceof ApiError && (error.code === 'network' || error.code === 'timeout')
        ? this.cache?.read<DashboardSummary>(cacheKey, CACHE_TTL)
        : null;
      if (cached) {
        this.applySummary(cached.data, true);
      } else {
        this.state.error = error instanceof Error ? error.message : '加载驾驶舱失败';
      }
    } finally {
      if (generation === this.requestGeneration) this.state.loading = false;
    }
  }

  private async loadInsights(scope: string, generation: number): Promise<void> {
    if (!this.api.fetchAiInsights) return;
    const cacheKey = `dashboard:${scope}:ai-insights`;
    try {
      const insights = await this.api.fetchAiInsights();
      if (generation !== this.requestGeneration) return;
      if (scope !== this.householdId()) { this.clearPrivateState(); return; }
      this.state.insights = insights;
      this.state.insightsFromCache = false;
      this.cache?.set(cacheKey, insights);
    } catch (error) {
      if (generation !== this.requestGeneration) return;
      if (scope !== this.householdId()) { this.clearPrivateState(); return; }
      const cached = error instanceof ApiError && (error.code === 'network' || error.code === 'timeout') ? this.cache?.read<AiInsight[]>(cacheKey, CACHE_TTL) : null;
      if (cached) { this.state.insights = cached.data; this.state.insightsFromCache = true; }
    }
  }

  private applySummary(summary: DashboardSummary, fromCache: boolean): void {
    this.state.summary = summary;
    this.state.pendingDraftCount = summary.pendingDraftCount ?? 0;
    this.state.duplicateCount = summary.duplicateCount ?? 0;
    this.state.recurringDueCount = summary.recurringDueCount ?? 0;
    this.state.recentTransactions = (summary.recentTransactions ?? []).slice(0, 3).map(recentTransaction);
    this.state.netWorthDisplay = formatNzdMinor(summary.netWorthMinor);
    this.state.totalAssetsDisplay = formatNzdMinor(summary.totalAssetsMinor ?? summary.netWorthMinor);
    this.state.initialAssetsDisplay = formatNzdMinor(summary.initialAssetsMinor ?? 0);
    this.state.termDepositDisplay = formatNzdMinor(summary.termDepositMinor ?? 0);
    this.state.incomeDisplay = formatNzdMinor(summary.incomeMinor);
    this.state.expenseDisplay = formatNzdMinor(summary.expenseMinor);
    this.state.fromCache = fromCache;
    this.state.cacheLabel = fromCache ? '缓存数据' : '';
  }

  private clearPrivateState(): void {
    this.state.summary = null;
    this.state.accounts = [];
    this.state.categories = [];
    this.state.pendingDraftCount = 0;
    this.state.duplicateCount = 0;
    this.state.recurringDueCount = 0;
    this.state.recentTransactions = [];
    this.state.fromCache = false;
    this.state.insights = [];
    this.state.insightsFromCache = false;
    this.state.error = '';
    this.state.netWorthDisplay = '--';
    this.state.totalAssetsDisplay = '--';
    this.state.initialAssetsDisplay = '--';
    this.state.termDepositDisplay = '--';
    this.state.incomeDisplay = '--';
    this.state.expenseDisplay = '--';
    this.state.cacheLabel = '';
  }
}

export function createDashboardPage(
  model: DashboardPageModel,
  period: () => PeriodQuery = () => {
    const bounds = getPeriodBounds(new Date(), 'month');
    return { from: bounds.from.toISOString(), to: bounds.to.toISOString() };
  },
) {
  return {
    data: model.state,
    async onShow(this: PageContext) {
      this.getTabBar?.()?.setData({ selected: 0 });
      await model.load(period());
      this.setData(model.state);
    },
    onPhotoEntry() { wx.navigateTo({ url: '/pages/entry/photo/index' }); },
    onManualEntry() { wx.navigateTo({ url: '/pages/ledger/edit/index' }); },
    onOpenLedger() { wx.switchTab({ url: '/pages/ledger/index' }); },
    onOpenAi() { wx.switchTab({ url: '/pages/ai/index' }); },
  };
}

declare function Page(options: Record<string, unknown>): void;
declare function getApp<T>(): T;
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
  const runtime = getRuntime();
  Page(withThemePage(createDashboardPage(new DashboardPageModel(runtime.api as unknown as DashboardApiPort, runtime.cache, () => runtime.sessions.read()?.householdId ?? 'anonymous')), runtime.theme));
}
