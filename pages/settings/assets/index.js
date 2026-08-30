"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssetSettingsModel = void 0;
exports.createAssetSettingsPage = createAssetSettingsPage;
const app_1 = require("../../../app");
const money_1 = require("../../../src/domain/money");
class AssetSettingsModel {
    constructor(api) {
        this.api = api;
        this.state = { primary: null, amount: '', loading: false, error: '', saved: false };
    }
    setAmount(amount) { this.state.amount = amount; }
    async load() {
        var _a;
        this.state.loading = true;
        this.state.error = '';
        try {
            const accounts = await this.api.fetchAccounts();
            this.state.primary = (_a = accounts.find((account) => account.systemKey === 'PRIMARY')) !== null && _a !== void 0 ? _a : null;
            if (this.state.primary)
                this.state.amount = (this.state.primary.openingBalanceMinor / 100).toFixed(2);
        }
        catch (error) {
            this.state.error = error instanceof Error ? error.message : '加载初始资产失败';
        }
        finally {
            this.state.loading = false;
        }
    }
    async saveInitialAsset() {
        var _a;
        this.state.error = '';
        this.state.saved = false;
        if (!this.state.primary) {
            this.state.error = '未找到家庭资产账户';
            return false;
        }
        let amountMinor;
        try {
            amountMinor = (0, money_1.parseNzdMinor)(this.state.amount);
        }
        catch {
            this.state.error = '请输入有效金额';
            return false;
        }
        const expectedVersion = (_a = this.state.primary.version) !== null && _a !== void 0 ? _a : 0;
        try {
            if (this.api.setInitialAsset)
                this.state.primary = await this.api.setInitialAsset(amountMinor, expectedVersion);
            else if (this.api.updateOpeningBalance)
                this.state.primary = await this.api.updateOpeningBalance(amountMinor, expectedVersion);
            else {
                this.state.error = '初始资产功能暂不可用';
                return false;
            }
            this.state.amount = (this.state.primary.openingBalanceMinor / 100).toFixed(2);
            this.state.saved = true;
            return true;
        }
        catch (error) {
            this.state.error = error instanceof Error ? error.message : '保存初始资产失败';
            return false;
        }
    }
}
exports.AssetSettingsModel = AssetSettingsModel;
function createAssetSettingsPage(model) {
    return {
        data: model.state,
        async onShow() { await model.load(); this.setData(model.state); },
        onAmountInput(event) { var _a, _b; model.setAmount((_b = (_a = event.detail) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : ''); this.setData(model.state); },
        async save() { await model.saveInitialAsset(); this.setData(model.state); },
    };
}
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
    const runtime = (0, app_1.getRuntime)();
    Page(createAssetSettingsPage(new AssetSettingsModel(runtime.api)));
}
