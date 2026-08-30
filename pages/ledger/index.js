"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LedgerPageModel = exports.LedgerListPageModel = void 0;
exports.createLedgerPage = createLedgerPage;
exports.createLedgerListPage = createLedgerListPage;
const client_1 = require("../../src/api/client");
const money_1 = require("../../src/domain/money");
const app_1 = require("../../app");
const period_1 = require("../../src/domain/period");
const directionLabels = {
    income: '收入', expense: '支出', transfer: '转账', adjustment: '调整',
};
function currentAucklandDate() { return new Date(); }
function aucklandBoundary(value) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(value);
    const read = (type) => { var _a, _b; return Number((_b = (_a = parts.find((part) => part.type === type)) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : 0); };
    const year = read('year');
    const month = read('month');
    const day = read('day');
    const hour = read('hour') === 24 ? 0 : read('hour');
    const minute = read('minute');
    const second = read('second');
    const localTimestamp = Date.UTC(year, month - 1, day, hour, minute, second);
    const offsetMinutes = Math.round((localTimestamp - value.valueOf()) / 60000);
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absoluteOffset = Math.abs(offsetMinutes);
    const offset = `${sign}${String(Math.floor(absoluteOffset / 60)).padStart(2, '0')}:${String(absoluteOffset % 60).padStart(2, '0')}`;
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}${offset}`;
}
function toDisplayDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.valueOf()))
        return value;
    return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
class LedgerListPageModel {
    constructor(api, now = currentAucklandDate) {
        this.api = api;
        this.now = now;
        this.state = {
            periodMode: 'month', period: { from: '', to: '' }, customFrom: '', customTo: '',
            transactions: [], selectedTransaction: null, loading: false, error: '',
        };
        const period = this.currentPeriod();
        this.state.period = period;
    }
    currentPeriod() {
        if (this.state.periodMode === 'custom' && this.state.customFrom && this.state.customTo) {
            return { from: this.state.customFrom, to: this.state.customTo };
        }
        const kind = this.state.periodMode === 'year' ? 'year' : 'month';
        const bounds = (0, period_1.getPeriodBounds)(this.now(), kind);
        return { from: aucklandBoundary(bounds.from), to: aucklandBoundary(bounds.to) };
    }
    setPeriod(mode, from, to) {
        this.state.periodMode = mode;
        if (mode === 'custom') {
            this.state.customFrom = from !== null && from !== void 0 ? from : this.state.customFrom;
            this.state.customTo = to !== null && to !== void 0 ? to : this.state.customTo;
            if (this.state.customFrom && this.state.customTo)
                this.state.period = { from: this.state.customFrom, to: this.state.customTo };
            return;
        }
        this.state.period = this.currentPeriod();
    }
    async load(period) {
        this.state.period = period;
        this.state.loading = true;
        this.state.error = '';
        this.state.selectedTransaction = null;
        try {
            const transactions = await this.api.fetchTransactions(period);
            this.state.transactions = transactions.map((transaction) => ({
                ...transaction,
                amountDisplay: (0, money_1.formatNzdMinor)(transaction.amountMinor),
                dateDisplay: toDisplayDate(transaction.occurredAt),
                directionLabel: directionLabels[transaction.direction],
            }));
            return true;
        }
        catch (error) {
            this.state.error = error instanceof Error ? error.message : '加载账目失败';
            return false;
        }
        finally {
            this.state.loading = false;
        }
    }
    selectTransaction(id) {
        const selected = this.state.transactions.find((transaction) => transaction.id === id);
        if (!selected) {
            this.state.selectedTransaction = null;
            return;
        }
        const { amountDisplay: _amountDisplay, dateDisplay: _dateDisplay, directionLabel: _directionLabel, ...transaction } = selected;
        this.state.selectedTransaction = transaction;
    }
    setCustomFrom(value) { this.state.customFrom = value; }
    setCustomTo(value) { this.state.customTo = value; }
}
exports.LedgerListPageModel = LedgerListPageModel;
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
function createLedgerListPage(model) {
    return {
        data: model.state,
        async onShow() {
            await model.load(model.currentPeriod());
            this.setData(model.state);
        },
        async changePeriod(event) {
            var _a, _b;
            const mode = (_b = (_a = event.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.mode;
            if (mode === 'month' || mode === 'year') {
                model.setPeriod(mode);
                await model.load(model.currentPeriod());
            }
            else if (mode === 'custom') {
                model.setPeriod('custom');
            }
            this.setData(model.state);
        },
        async applyCustomPeriod() {
            if (!model.state.customFrom || !model.state.customTo) {
                model.state.error = '请选择完整的起止日期';
            }
            else if (model.state.customFrom > model.state.customTo) {
                model.state.error = '开始日期不能晚于结束日期';
            }
            else {
                model.setPeriod('custom', model.state.customFrom, model.state.customTo);
                await model.load(model.state.period);
            }
            this.setData(model.state);
        },
        onCustomFrom(event) {
            var _a, _b;
            model.setCustomFrom((_b = (_a = event.detail) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : '');
            this.setData(model.state);
        },
        onCustomTo(event) {
            var _a, _b;
            model.setCustomTo((_b = (_a = event.detail) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : '');
            this.setData(model.state);
        },
        openDetail(event) {
            var _a, _b, _c;
            model.selectTransaction((_c = (_b = (_a = event.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.id) !== null && _c !== void 0 ? _c : '');
            this.setData(model.state);
        },
        closeDetail() {
            model.state.selectedTransaction = null;
            this.setData(model.state);
        },
    };
}
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
    const runtime = (0, app_1.getRuntime)();
    Page(createLedgerListPage(new LedgerListPageModel(runtime.api)));
}
