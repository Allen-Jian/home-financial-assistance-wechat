"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DraftReviewPageModel = void 0;
exports.createDraftsPage = createDraftsPage;
const client_1 = require("../../src/api/client");
const app_1 = require("../../app");
class DraftReviewPageModel {
    constructor(api) {
        this.api = api;
        this.state = {
            drafts: [], index: 0, current: null, accountId: '', editing: false, loading: false,
            error: '', duplicateDetails: null, duplicateActions: [], accounts: [], accountName: '',
        };
    }
    async load() {
        var _a, _b, _c;
        this.state.loading = true;
        this.state.error = '';
        try {
            const [drafts, accounts] = await Promise.all([
                this.api.fetchPendingDrafts(),
                (_c = (_b = (_a = this.api).fetchAccounts) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : Promise.resolve([]),
            ]);
            this.state.drafts = drafts;
            this.state.accounts = accounts;
            this.state.index = 0;
            this.syncCurrent();
        }
        catch (error) {
            this.state.error = error instanceof Error ? error.message : '加载草稿失败';
        }
        finally {
            this.state.loading = false;
        }
    }
    setAccount(accountId) { this.state.accountId = accountId; }
    setAccountByIndex(index) {
        const account = this.state.accounts[index];
        if (account) {
            this.state.accountId = account.id;
            this.state.accountName = account.name;
        }
    }
    setEditing(editing) { this.state.editing = editing; }
    async confirm() {
        if (!this.state.current)
            return false;
        if (!this.state.accountId) {
            this.state.error = '请选择入账账户';
            return false;
        }
        return this.send({ accountId: this.state.accountId });
    }
    async chooseDuplicate(action) {
        if (action === 'later') {
            this.state.duplicateDetails = null;
            this.state.duplicateActions = [];
            this.state.error = '已保留草稿，稍后可继续处理';
            return false;
        }
        if (!this.state.current || !this.state.accountId)
            return false;
        return this.send({ accountId: this.state.accountId, allowDuplicate: true });
    }
    async send(input) {
        const draft = this.state.current;
        if (!draft)
            return false;
        try {
            await this.api.confirmDraft(draft.id, input);
            this.state.drafts = this.state.drafts.filter((item) => item.id !== draft.id);
            this.state.index = Math.min(this.state.index, Math.max(this.state.drafts.length - 1, 0));
            this.state.duplicateDetails = null;
            this.state.duplicateActions = [];
            this.state.error = '';
            this.syncCurrent();
            return true;
        }
        catch (error) {
            if (error instanceof client_1.ApiError && error.statusCode === 409) {
                this.state.duplicateDetails = error.details;
                this.state.duplicateActions = ['稍后处理', '保留两笔'];
                this.state.error = '发现可能重复，请选择处理方式';
                return false;
            }
            this.state.error = error instanceof Error ? error.message : '确认草稿失败';
            return false;
        }
    }
    syncCurrent() {
        var _a;
        this.state.current = (_a = this.state.drafts[this.state.index]) !== null && _a !== void 0 ? _a : null;
    }
}
exports.DraftReviewPageModel = DraftReviewPageModel;
function createDraftsPage(model) {
    return {
        data: model.state,
        async onShow() { await model.load(); this.setData(model.state); },
        onAccountChange(event) { var _a, _b; model.setAccountByIndex(Number((_b = (_a = event.detail) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : -1)); this.setData(model.state); },
        onEdit() { model.setEditing(true); this.setData(model.state); },
        async confirm() { await model.confirm(); this.setData(model.state); },
        async later() { await model.chooseDuplicate('later'); this.setData(model.state); },
        async keepBoth() { await model.chooseDuplicate('keep-both'); this.setData(model.state); },
    };
}
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
    const runtime = (0, app_1.getRuntime)();
    Page(createDraftsPage(new DraftReviewPageModel(runtime.api)));
}
