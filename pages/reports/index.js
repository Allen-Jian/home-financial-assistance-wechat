"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportPageModel = void 0;
exports.createReportsPage = createReportsPage;
const period_1 = require("../../src/domain/period");
const app_1 = require("../../app");
const money_1 = require("../../src/domain/money");
const themed_page_1 = require("../../src/shared/themed-page");
class ReportPageModel {
    constructor(api) {
        this.api = api;
        this.state = {
            periodKind: 'month', period: { from: '', to: '' }, report: null, selectedCategory: '',
            loading: false, error: '', exported: null, incomeDisplay: '', expenseDisplay: '', netDisplay: '', categoryBreakdown: [],
        };
    }
    async load(kind, anchor) {
        const bounds = (0, period_1.getPeriodBounds)(anchor, kind);
        const period = { from: bounds.from.toISOString(), to: bounds.to.toISOString() };
        this.state.periodKind = kind;
        this.state.period = period;
        this.state.selectedCategory = '';
        this.state.loading = true;
        this.state.error = '';
        try {
            this.applyReport(await this.api.fetchReports(period));
            return true;
        }
        catch (error) {
            this.state.error = error instanceof Error ? error.message : '加载报表失败';
            return false;
        }
        finally {
            this.state.loading = false;
        }
    }
    async drillDownCategory(category) {
        if (!this.state.report)
            return false;
        this.state.selectedCategory = category;
        try {
            this.applyReport(await this.api.fetchReports({ ...this.state.period, category }));
            return true;
        }
        catch (error) {
            this.state.error = error instanceof Error ? error.message : '加载分类明细失败';
            return false;
        }
    }
    async export(format) {
        this.state.exported = await this.api.exportTransactions(this.state.period, format);
        return this.state.exported;
    }
    applyReport(report) {
        this.state.report = report;
        this.state.incomeDisplay = (0, money_1.formatNzdMinor)(report.incomeMinor);
        this.state.expenseDisplay = (0, money_1.formatNzdMinor)(report.expenseMinor);
        const net = report.incomeMinor - report.expenseMinor;
        this.state.netDisplay = `${net > 0 ? '+ ' : net < 0 ? '− ' : ''}${(0, money_1.formatNzdMinor)(Math.abs(net))}`;
        this.state.categoryBreakdown = report.categoryBreakdown.map((row) => ({ label: row.label, amountDisplay: (0, money_1.formatNzdMinor)(row.amountMinor) }));
    }
}
exports.ReportPageModel = ReportPageModel;
function createReportsPage(model) {
    return {
        data: model.state,
        async onShow() { await model.load('month', new Date()); this.setData(model.state); },
        async changePeriod(event) {
            var _a, _b;
            const kind = (_b = (_a = event.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.kind;
            if (kind === 'month' || kind === 'quarter' || kind === 'year')
                await model.load(kind, new Date());
            this.setData(model.state);
        },
        async drillDown(event) {
            var _a, _b, _c;
            await model.drillDownCategory((_c = (_b = (_a = event.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.category) !== null && _c !== void 0 ? _c : '');
            this.setData(model.state);
        },
        async exportJson() { await model.export('json'); this.setData(model.state); },
        async exportCsv() { await model.export('csv'); this.setData(model.state); },
    };
}
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
    const runtime = (0, app_1.getRuntime)();
    Page((0, themed_page_1.withThemePage)(createReportsPage(new ReportPageModel(runtime.api)), runtime.theme));
}
