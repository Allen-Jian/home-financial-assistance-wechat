"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TermDepositSettingsModel = void 0;
exports.createTermDepositSettingsPage = createTermDepositSettingsPage;
const app_1 = require("../../../app");
class TermDepositSettingsModel {
    constructor(api) {
        this.api = api;
        this.state = {
            deposits: [], draft: { name: '', principalMinor: 0, annualRateBasisPoints: 0, startedAt: '', maturesAt: '' }, loading: false, error: '',
        };
    }
    async load() {
        if (!this.api.fetchTermDeposits)
            return;
        this.state.loading = true;
        this.state.error = '';
        try {
            this.state.deposits = await this.api.fetchTermDeposits();
        }
        catch (error) {
            this.state.error = error instanceof Error ? error.message : '加载定存失败';
        }
        finally {
            this.state.loading = false;
        }
    }
    async create(input) {
        if (!input.name.trim() || !Number.isInteger(input.principalMinor) || input.principalMinor <= 0 || !Number.isInteger(input.annualRateBasisPoints) || input.annualRateBasisPoints < 0 || !input.startedAt || !input.maturesAt) {
            this.state.error = '定存信息无效';
            return false;
        }
        try {
            this.state.deposits.push(await this.api.createTermDeposit(input));
            return true;
        }
        catch (error) {
            this.state.error = error instanceof Error ? error.message : '创建定存失败';
            return false;
        }
    }
    setDraft(input) { this.state.draft = { ...this.state.draft, ...input }; }
    async close(id, expectedVersion) {
        if (!this.api.closeTermDeposit) {
            this.state.error = '定存关闭功能暂不可用';
            return false;
        }
        try {
            const updated = await this.api.closeTermDeposit(id, expectedVersion);
            const index = this.state.deposits.findIndex((deposit) => deposit.id === id);
            if (index >= 0)
                this.state.deposits[index] = { ...this.state.deposits[index], ...updated };
            return true;
        }
        catch (error) {
            this.state.error = error instanceof Error ? error.message : '关闭定存失败';
            return false;
        }
    }
}
exports.TermDepositSettingsModel = TermDepositSettingsModel;
function createTermDepositSettingsPage(model) {
    return {
        data: model.state,
        async onShow() { await model.load(); this.setData(model.state); },
        onDraftInput(event) {
            var _a, _b, _c, _d;
            const field = (_b = (_a = event.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.field;
            const value = (_d = (_c = event.detail) === null || _c === void 0 ? void 0 : _c.value) !== null && _d !== void 0 ? _d : '';
            if (field === 'name' || field === 'startedAt' || field === 'maturesAt' || field === 'note')
                model.setDraft({ [field]: value });
            if (field === 'principalMinor')
                model.setDraft({ principalMinor: Math.round(Number(value) * 100) });
            if (field === 'annualRateBasisPoints')
                model.setDraft({ annualRateBasisPoints: Number(value) });
            this.setData(model.state);
        },
        async create() { await model.create(model.state.draft); this.setData(model.state); },
        async close(event) {
            var _a, _b, _c, _d;
            const id = (_b = (_a = event.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.id;
            const version = Number((_d = (_c = event.currentTarget) === null || _c === void 0 ? void 0 : _c.dataset) === null || _d === void 0 ? void 0 : _d.version);
            if (id && Number.isInteger(version))
                await model.close(id, version);
            this.setData(model.state);
        },
    };
}
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
    const runtime = (0, app_1.getRuntime)();
    Page(createTermDepositSettingsPage(new TermDepositSettingsModel(runtime.api)));
}
