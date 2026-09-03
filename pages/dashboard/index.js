"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardPageModel = void 0;
exports.createDashboardPage = createDashboardPage;
const client_1 = require("../../src/api/client");
const app_1 = require("../../app");
const period_1 = require("../../src/domain/period");
const money_1 = require("../../src/domain/money");
const themed_page_1 = require("../../src/shared/themed-page");
const CACHE_TTL = 5 * 60000;
function recentTransaction(transaction) {
    const amount = (0, money_1.formatNzdMinor)(transaction.amountMinor);
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
class DashboardPageModel {
    constructor(api, cache, householdId = () => 'anonymous') {
        this.api = api;
        this.cache = cache;
        this.householdId = householdId;
        this.requestGeneration = 0;
        this.state = {
            loading: false, error: '', summary: null, accounts: [], categories: [],
            pendingDraftCount: 0, duplicateCount: 0, recurringDueCount: 0, recentTransactions: [],
            fromCache: false, cacheLabel: '', netWorthDisplay: '--', totalAssetsDisplay: '--', initialAssetsDisplay: '--', termDepositDisplay: '--', incomeDisplay: '--', expenseDisplay: '--', insights: [], insightsFromCache: false,
        };
    }
    async load(period) {
        var _a, _b;
        const generation = ++this.requestGeneration;
        const scope = this.householdId();
        const cacheKey = `dashboard:${scope}:${period.from}:${period.to}`;
        this.state.loading = true;
        this.state.error = '';
        try {
            const [summary, accounts, categories] = await Promise.all([
                this.api.fetchSummary(period), this.api.fetchAccounts(), this.api.fetchCategories(),
            ]);
            if (generation !== this.requestGeneration)
                return;
            if (scope !== this.householdId()) {
                this.clearPrivateState();
                return;
            }
            this.applySummary(summary, false);
            this.state.accounts = accounts;
            this.state.categories = categories;
            (_a = this.cache) === null || _a === void 0 ? void 0 : _a.set(cacheKey, summary);
            await this.loadInsights(scope, generation);
        }
        catch (error) {
            if (generation !== this.requestGeneration)
                return;
            if (scope !== this.householdId()) {
                this.clearPrivateState();
                return;
            }
            const cached = error instanceof client_1.ApiError && (error.code === 'network' || error.code === 'timeout')
                ? (_b = this.cache) === null || _b === void 0 ? void 0 : _b.read(cacheKey, CACHE_TTL)
                : null;
            if (cached) {
                this.applySummary(cached.data, true);
            }
            else {
                this.state.error = error instanceof Error ? error.message : '加载驾驶舱失败';
            }
        }
        finally {
            if (generation === this.requestGeneration)
                this.state.loading = false;
        }
    }
    async loadInsights(scope, generation) {
        var _a, _b;
        if (!this.api.fetchAiInsights)
            return;
        const cacheKey = `dashboard:${scope}:ai-insights`;
        try {
            const insights = await this.api.fetchAiInsights();
            if (generation !== this.requestGeneration)
                return;
            if (scope !== this.householdId()) {
                this.clearPrivateState();
                return;
            }
            this.state.insights = insights;
            this.state.insightsFromCache = false;
            (_a = this.cache) === null || _a === void 0 ? void 0 : _a.set(cacheKey, insights);
        }
        catch (error) {
            if (generation !== this.requestGeneration)
                return;
            if (scope !== this.householdId()) {
                this.clearPrivateState();
                return;
            }
            const cached = error instanceof client_1.ApiError && (error.code === 'network' || error.code === 'timeout') ? (_b = this.cache) === null || _b === void 0 ? void 0 : _b.read(cacheKey, CACHE_TTL) : null;
            if (cached) {
                this.state.insights = cached.data;
                this.state.insightsFromCache = true;
            }
        }
    }
    applySummary(summary, fromCache) {
        var _a, _b, _c, _d, _e, _f, _g;
        this.state.summary = summary;
        this.state.pendingDraftCount = (_a = summary.pendingDraftCount) !== null && _a !== void 0 ? _a : 0;
        this.state.duplicateCount = (_b = summary.duplicateCount) !== null && _b !== void 0 ? _b : 0;
        this.state.recurringDueCount = (_c = summary.recurringDueCount) !== null && _c !== void 0 ? _c : 0;
        this.state.recentTransactions = ((_d = summary.recentTransactions) !== null && _d !== void 0 ? _d : []).slice(0, 3).map(recentTransaction);
        this.state.netWorthDisplay = (0, money_1.formatNzdMinor)(summary.netWorthMinor);
        this.state.totalAssetsDisplay = (0, money_1.formatNzdMinor)((_e = summary.totalAssetsMinor) !== null && _e !== void 0 ? _e : summary.netWorthMinor);
        this.state.initialAssetsDisplay = (0, money_1.formatNzdMinor)((_f = summary.initialAssetsMinor) !== null && _f !== void 0 ? _f : 0);
        this.state.termDepositDisplay = (0, money_1.formatNzdMinor)((_g = summary.termDepositMinor) !== null && _g !== void 0 ? _g : 0);
        this.state.incomeDisplay = (0, money_1.formatNzdMinor)(summary.incomeMinor);
        this.state.expenseDisplay = (0, money_1.formatNzdMinor)(summary.expenseMinor);
        this.state.fromCache = fromCache;
        this.state.cacheLabel = fromCache ? '缓存数据' : '';
    }
    clearPrivateState() {
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
exports.DashboardPageModel = DashboardPageModel;
function createDashboardPage(model, period = () => {
    const bounds = (0, period_1.getPeriodBounds)(new Date(), 'month');
    return { from: bounds.from.toISOString(), to: bounds.to.toISOString() };
}) {
    return {
        data: model.state,
        async onShow() {
            var _a, _b;
            (_b = (_a = this.getTabBar) === null || _a === void 0 ? void 0 : _a.call(this)) === null || _b === void 0 ? void 0 : _b.setData({ selected: 0 });
            await model.load(period());
            this.setData(model.state);
        },
        onPhotoEntry() { wx.navigateTo({ url: '/pages/entry/photo/index' }); },
        onManualEntry() { wx.navigateTo({ url: '/pages/ledger/edit/index' }); },
        onOpenLedger() { wx.switchTab({ url: '/pages/ledger/index' }); },
        onOpenAi() { wx.switchTab({ url: '/pages/ai/index' }); },
    };
}
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
    const runtime = (0, app_1.getRuntime)();
    Page((0, themed_page_1.withThemePage)(createDashboardPage(new DashboardPageModel(runtime.api, runtime.cache, () => { var _a, _b; return (_b = (_a = runtime.sessions.read()) === null || _a === void 0 ? void 0 : _a.householdId) !== null && _b !== void 0 ? _b : 'anonymous'; })), runtime.theme));
}
