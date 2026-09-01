"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MorePageModel = exports.APPEARANCE_OPTIONS = exports.THEME_SAVE_WARNING = void 0;
exports.createMorePage = createMorePage;
const app_1 = require("../../app");
const period_1 = require("../../src/domain/period");
const themed_page_1 = require("../../src/shared/themed-page");
exports.THEME_SAVE_WARNING = '外观设置未能保存，下次打开可能恢复为跟随系统';
exports.APPEARANCE_OPTIONS = [
    { label: '浅色', value: 'light' },
    { label: '深色', value: 'dark' },
    { label: '跟随系统', value: 'system' },
];
class MorePageModel {
    constructor(api) {
        this.api = api;
        this.state = { exported: null, error: '' };
    }
    async export(period, format) { this.state.exported = await this.api.exportTransactions(period, format); return this.state.exported; }
    async logout() { await this.api.logout(); }
}
exports.MorePageModel = MorePageModel;
function createMorePage(model, theme) {
    return {
        data: { ...model.state, appearanceOptions: exports.APPEARANCE_OPTIONS, themePersistenceWarning: '' },
        onShow() { var _a, _b; (_b = (_a = this.getTabBar) === null || _a === void 0 ? void 0 : _a.call(this)) === null || _b === void 0 ? void 0 : _b.setData({ selected: 4 }); },
        async exportJson() { await model.export(currentPeriod(), 'json'); this.setData(model.state); },
        async exportCsv() { await model.export(currentPeriod(), 'csv'); this.setData(model.state); },
        async logout() { await model.logout(); wx.reLaunch({ url: '/pages/login/index' }); this.setData(model.state); },
        onAppearanceSelect(event) {
            var _a, _b;
            const value = (_b = (_a = event.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.value;
            if (value !== 'light' && value !== 'dark' && value !== 'system')
                return;
            const result = (theme !== null && theme !== void 0 ? theme : (0, app_1.getRuntime)().theme).setPreference(value);
            this.setData({ ...result.snapshot, themePersistenceWarning: result.persisted ? '' : exports.THEME_SAVE_WARNING });
        },
    };
}
function currentPeriod() {
    const bounds = (0, period_1.getPeriodBounds)(new Date(), 'month');
    return { from: bounds.from.toISOString(), to: bounds.to.toISOString() };
}
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
    const runtime = (0, app_1.getRuntime)();
    Page((0, themed_page_1.withThemePage)(createMorePage(new MorePageModel(runtime.api), runtime.theme), runtime.theme));
}
