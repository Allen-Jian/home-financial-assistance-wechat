"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardPageModel = void 0;
exports.createDashboardPage = createDashboardPage;
const client_1 = require("../../src/api/client");
const app_1 = require("../../app");
const period_1 = require("../../src/domain/period");
const money_1 = require("../../src/domain/money");
const CACHE_TTL = 5 * 60000;
class DashboardPageModel {
    constructor(api, cache) {
        this.api = api;
        this.cache = cache;
        this.state = {
            loading: false, error: '', summary: null, accounts: [], categories: [],
            pendingDraftCount: 0, duplicateCount: 0, recurringDueCount: 0, recentTransactions: [],
            fromCache: false, cacheLabel: '', netWorthDisplay: '--', incomeDisplay: '--', expenseDisplay: '--',
        };
    }
    async load(period) {
        var _a, _b;
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
            (_a = this.cache) === null || _a === void 0 ? void 0 : _a.set(cacheKey, summary);
        }
        catch (error) {
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
            this.state.loading = false;
        }
    }
    applySummary(summary, fromCache) {
        var _a, _b, _c, _d;
        this.state.summary = summary;
        this.state.pendingDraftCount = (_a = summary.pendingDraftCount) !== null && _a !== void 0 ? _a : 0;
        this.state.duplicateCount = (_b = summary.duplicateCount) !== null && _b !== void 0 ? _b : 0;
        this.state.recurringDueCount = (_c = summary.recurringDueCount) !== null && _c !== void 0 ? _c : 0;
        this.state.recentTransactions = (_d = summary.recentTransactions) !== null && _d !== void 0 ? _d : [];
        this.state.netWorthDisplay = (0, money_1.formatNzdMinor)(summary.netWorthMinor);
        this.state.incomeDisplay = (0, money_1.formatNzdMinor)(summary.incomeMinor);
        this.state.expenseDisplay = (0, money_1.formatNzdMinor)(summary.expenseMinor);
        this.state.fromCache = fromCache;
        this.state.cacheLabel = fromCache ? '缓存数据' : '';
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
            await model.load(period());
            this.setData(model.state);
        },
        onQuickEntry() { wx.navigateTo({ url: '/pages/ledger/index' }); },
    };
}
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
    const runtime = (0, app_1.getRuntime)();
    Page(createDashboardPage(new DashboardPageModel(runtime.api, runtime.cache)));
}
