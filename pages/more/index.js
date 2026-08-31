"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MorePageModel = void 0;
exports.createMorePage = createMorePage;
const app_1 = require("../../app");
const period_1 = require("../../src/domain/period");
const themed_page_1 = require("../../src/shared/themed-page");
class MorePageModel {
    constructor(api) {
        this.api = api;
        this.state = { exported: null, error: '' };
    }
    async export(period, format) { this.state.exported = await this.api.exportTransactions(period, format); return this.state.exported; }
    async logout() { await this.api.logout(); }
}
exports.MorePageModel = MorePageModel;
function createMorePage(model) {
    return {
        data: model.state,
        async exportJson() { await model.export(currentPeriod(), 'json'); this.setData(model.state); },
        async exportCsv() { await model.export(currentPeriod(), 'csv'); this.setData(model.state); },
        async logout() { await model.logout(); wx.reLaunch({ url: '/pages/login/index' }); this.setData(model.state); },
    };
}
function currentPeriod() {
    const bounds = (0, period_1.getPeriodBounds)(new Date(), 'month');
    return { from: bounds.from.toISOString(), to: bounds.to.toISOString() };
}
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
    const runtime = (0, app_1.getRuntime)();
    Page((0, themed_page_1.withThemePage)(createMorePage(new MorePageModel(runtime.api)), runtime.theme));
}
