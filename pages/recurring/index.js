"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecurringPageModel = void 0;
exports.createRecurringPage = createRecurringPage;
const app_1 = require("../../app");
const money_1 = require("../../src/domain/money");
const themed_page_1 = require("../../src/shared/themed-page");
function recurringDisplay(item) { return { ...item, amountDisplay: (0, money_1.formatNzdMinor)(item.amountMinor) }; }
class RecurringPageModel {
    constructor(api) {
        this.api = api;
        this.state = { templates: [], dueCount: 0, loading: false, error: '' };
    }
    async load() {
        this.state.loading = true;
        try {
            this.state.templates = (await this.api.fetchRecurring()).map(recurringDisplay);
            this.state.dueCount = this.state.templates.filter((item) => item.active).length;
        }
        catch (error) {
            this.state.error = error instanceof Error ? error.message : '加载周期账单失败';
        }
        finally {
            this.state.loading = false;
        }
    }
    async create(input) {
        const amount = input.amountMinor;
        const day = input.dayOfMonth;
        if (!Number.isInteger(amount) || amount <= 0 || !Number.isInteger(day) || day < 1 || day > 31) {
            this.state.error = '周期账单金额和日期无效';
            return false;
        }
        try {
            this.state.templates.push(recurringDisplay(await this.api.createRecurring(input)));
            this.state.dueCount += 1;
            return true;
        }
        catch (error) {
            this.state.error = error instanceof Error ? error.message : '创建周期账单失败';
            return false;
        }
    }
    async advance(id) {
        try {
            const updated = await this.api.advanceRecurring(id);
            const index = this.state.templates.findIndex((item) => item.id === id);
            if (index >= 0)
                this.state.templates[index] = recurringDisplay({ ...this.state.templates[index], ...updated });
            return true;
        }
        catch (error) {
            this.state.error = error instanceof Error ? error.message : '更新周期账单失败';
            return false;
        }
    }
}
exports.RecurringPageModel = RecurringPageModel;
function createRecurringPage(model) {
    return {
        data: model.state,
        async onShow() { await model.load(); this.setData(model.state); },
    };
}
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
    const runtime = (0, app_1.getRuntime)();
    Page((0, themed_page_1.withThemePage)(createRecurringPage(new RecurringPageModel(runtime.api)), runtime.theme));
}
