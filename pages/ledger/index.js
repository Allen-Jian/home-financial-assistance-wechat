"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LedgerPageModel = void 0;
exports.createLedgerPage = createLedgerPage;
const client_1 = require("../../src/api/client");
const money_1 = require("../../src/domain/money");
const app_1 = require("../../app");
const makeIdempotencyKey = () => `mini-${Date.now()}-${Math.random().toString(36).slice(2)}`;
class LedgerPageModel {
    constructor(api, idFactory = makeIdempotencyKey) {
        this.api = api;
        this.idFactory = idFactory;
        this.state = {
            direction: 'expense', amount: '', accountId: '', categoryId: '',
            occurredAt: new Date().toISOString().slice(0, 10), note: '', error: '', saved: false,
            duplicateDetails: null, duplicateActions: [], accounts: [], categories: [], accountName: '', categoryName: '',
        };
        this.pendingPayload = null;
    }
    setDirection(value) { this.state.direction = value; }
    setAmount(value) { this.state.amount = value; }
    setAccount(value) { this.state.accountId = value; }
    setCategory(value) { this.state.categoryId = value; }
    setDate(value) { this.state.occurredAt = value; }
    setNote(value) { this.state.note = value; }
    setAccounts(accounts) { this.state.accounts = accounts; }
    setCategories(categories) { this.state.categories = categories; }
    setAccountByIndex(index) {
        const account = this.state.accounts[index];
        if (account) {
            this.state.accountId = account.id;
            this.state.accountName = account.name;
        }
    }
    setCategoryByIndex(index) {
        const category = this.state.categories[index];
        if (category) {
            this.state.categoryId = category.id;
            this.state.categoryName = category.name;
        }
    }
    async load() {
        var _a, _b, _c, _d, _e, _f;
        const [accounts, categories] = await Promise.all([
            (_c = (_b = (_a = this.api).fetchAccounts) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : Promise.resolve([]),
            (_f = (_e = (_d = this.api).fetchCategories) === null || _e === void 0 ? void 0 : _e.call(_d)) !== null && _f !== void 0 ? _f : Promise.resolve([]),
        ]);
        this.setAccounts(accounts);
        this.setCategories(categories);
    }
    async submit() {
        this.state.error = '';
        this.state.saved = false;
        let amountMinor;
        try {
            amountMinor = (0, money_1.parseNzdMinor)(this.state.amount);
        }
        catch {
            this.state.error = '请输入有效金额';
            return false;
        }
        if (amountMinor <= 0) {
            this.state.error = '金额必须大于 0';
            return false;
        }
        if (!this.state.accountId) {
            this.state.error = '请选择账户';
            return false;
        }
        const occurredAt = new Date(`${this.state.occurredAt}T00:00:00.000Z`);
        if (Number.isNaN(occurredAt.valueOf())) {
            this.state.error = '请选择有效日期';
            return false;
        }
        const payload = {
            direction: this.state.direction, amountMinor, accountId: this.state.accountId,
            occurredAt: occurredAt.toISOString(), idempotencyKey: this.idFactory(),
        };
        if (this.state.categoryId)
            payload.categoryId = this.state.categoryId;
        if (this.state.note.trim())
            payload.note = this.state.note.trim();
        return this.send(payload);
    }
    async chooseDuplicate(action) {
        if (action === 'later') {
            this.pendingPayload = null;
            this.state.duplicateDetails = null;
            this.state.duplicateActions = [];
            this.state.error = '已保留为待处理项';
            return false;
        }
        if (!this.pendingPayload)
            return false;
        return this.send({ ...this.pendingPayload, allowDuplicate: true });
    }
    async send(payload) {
        try {
            await this.api.createTransaction(payload);
            this.state.saved = true;
            this.state.duplicateDetails = null;
            this.state.duplicateActions = [];
            this.pendingPayload = null;
            return true;
        }
        catch (error) {
            if (error instanceof client_1.ApiError && error.statusCode === 409) {
                this.pendingPayload = payload;
                this.state.duplicateDetails = error.details;
                this.state.duplicateActions = ['稍后处理', '保留两笔'];
                this.state.error = '发现可能重复，请选择处理方式';
                return false;
            }
            this.state.error = error instanceof Error ? error.message : '保存失败，请稍后重试';
            return false;
        }
    }
}
exports.LedgerPageModel = LedgerPageModel;
function createLedgerPage(model) {
    return {
        data: model.state,
        onDirectionChange(event) {
            var _a, _b;
            const direction = (_b = (_a = event.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.value;
            if (direction === 'income' || direction === 'expense' || direction === 'transfer')
                model.setDirection(direction);
            this.setData(model.state);
        },
        onAmountInput(event) { var _a, _b; model.setAmount((_b = (_a = event.detail) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : ''); this.setData(model.state); },
        onAccountChange(event) { var _a, _b; model.setAccountByIndex(Number((_b = (_a = event.detail) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : -1)); this.setData(model.state); },
        onCategoryChange(event) { var _a, _b; model.setCategoryByIndex(Number((_b = (_a = event.detail) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : -1)); this.setData(model.state); },
        onDateChange(event) { var _a, _b; model.setDate((_b = (_a = event.detail) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : ''); this.setData(model.state); },
        onNoteInput(event) { var _a, _b; model.setNote((_b = (_a = event.detail) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : ''); this.setData(model.state); },
        setAccounts(accounts) { model.setAccounts(accounts); },
        openImports() { wx.navigateTo({ url: '/pages/imports/index' }); },
        async onLoad() { await model.load(); this.setData(model.state); },
        async save() { await model.submit(); this.setData(model.state); },
        async later() { await model.chooseDuplicate('later'); this.setData(model.state); },
        async keepBoth() { await model.chooseDuplicate('keep-both'); this.setData(model.state); },
    };
}
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
    const runtime = (0, app_1.getRuntime)();
    Page(createLedgerPage(new LedgerPageModel(runtime.api)));
}
