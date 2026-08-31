"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiPageModel = exports.QUICK_QUESTIONS = void 0;
exports.createAiPage = createAiPage;
const client_1 = require("../../src/api/client");
const copy_1 = require("../../src/shared/copy");
const app_1 = require("../../app");
const money_1 = require("../../src/domain/money");
const themed_page_1 = require("../../src/shared/themed-page");
exports.QUICK_QUESTIONS = ['本月花最多的分类？', '找出异常支出', '比较本季与上季'];
function citationDisplay(citation) {
    return { ...citation, amountDisplay: (0, money_1.formatNzdMinor)(citation.amountMinor) };
}
function isMessage(value) {
    if (!value || typeof value !== 'object')
        return false;
    const item = value;
    return (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string';
}
class AiPageModel {
    constructor(api, isOnline, navigate, storage) {
        this.api = api;
        this.isOnline = isOnline;
        this.navigate = navigate;
        this.storage = storage;
        this.state = { quickQuestions: exports.QUICK_QUESTIONS, messages: this.readHistory(), loading: false, error: '', notice: copy_1.copy.aiReadOnlyNotice, conversationId: '', draft: '' };
    }
    async hydrate() {
        if (!this.isOnline() || !this.api.listAiConversations)
            return;
        try {
            const conversations = await this.api.listAiConversations();
            const latest = conversations[0];
            if (!latest)
                return;
            this.state.conversationId = latest.id;
            if (Array.isArray(latest.messages))
                this.state.messages = latest.messages.map((message) => {
                    const content = typeof message.contentJson === 'object' && message.contentJson !== null ? message.contentJson : {};
                    return {
                        role: message.role,
                        content: typeof content.answer === 'string' ? content.answer : typeof content.text === 'string' ? content.text : '',
                        scope: content.scope,
                        citations: Array.isArray(content.citations) ? content.citations.map(citationDisplay) : undefined,
                        insights: Array.isArray(content.insights) ? content.insights : undefined,
                    };
                }).filter((message) => message.content);
            this.persist();
        }
        catch { /* cached chat remains visible */ }
    }
    async send(message) {
        var _a, _b;
        const value = message.trim();
        if (!value)
            return false;
        if (!this.isOnline()) {
            this.state.error = copy_1.copy.networkRequired;
            return false;
        }
        this.state.loading = true;
        this.state.error = '';
        this.state.messages.push({ role: 'user', content: value });
        this.persist();
        try {
            const result = await this.api.askAi({ conversationId: this.state.conversationId || undefined, message: value });
            this.state.conversationId = result.conversationId || this.state.conversationId;
            this.state.messages.push({ role: 'assistant', content: result.answer, scope: result.scope, citations: ((_a = result.citations) !== null && _a !== void 0 ? _a : []).map(citationDisplay), insights: (_b = result.insights) !== null && _b !== void 0 ? _b : [] });
            this.persist();
            return true;
        }
        catch (error) {
            if (error instanceof client_1.ApiError && error.statusCode === 401) {
                this.navigate('/pages/login/index');
                this.state.error = copy_1.copy.loginExpired;
            }
            else if (error instanceof client_1.ApiError && error.statusCode === 409) {
                this.state.error = copy_1.copy.duplicateConflict;
            }
            else if (error instanceof client_1.ApiError && error.code === 'timeout') {
                this.state.error = copy_1.copy.requestTimeout;
            }
            else {
                this.state.error = error instanceof Error ? error.message : copy_1.copy.aiFailed;
            }
            return false;
        }
        finally {
            this.state.loading = false;
        }
    }
    setDraft(value) { this.state.draft = value; }
    async sendCurrent() {
        const sent = await this.send(this.state.draft);
        if (sent)
            this.state.draft = '';
        return sent;
    }
    deleteHistory() {
        const conversationId = this.state.conversationId;
        this.state.messages = [];
        this.state.conversationId = '';
        this.storage.removeStorageSync(copy_1.AI_CHAT_STORAGE_KEY);
        if (!conversationId || !this.api.deleteAiConversation)
            return Promise.resolve(true);
        return this.api.deleteAiConversation(conversationId).then((result) => result.deleted).catch(() => false);
    }
    readHistory() {
        const raw = this.storage.getStorageSync(copy_1.AI_CHAT_STORAGE_KEY);
        if (typeof raw !== 'string')
            return [];
        try {
            const value = JSON.parse(raw);
            return Array.isArray(value) ? value.filter(isMessage).map((message) => {
                var _a;
                return ({
                    ...message,
                    citations: (_a = message.citations) === null || _a === void 0 ? void 0 : _a.map((citation) => { var _a; return ({ ...citation, amountDisplay: (_a = citation.amountDisplay) !== null && _a !== void 0 ? _a : (0, money_1.formatNzdMinor)(citation.amountMinor) }); }),
                });
            }) : [];
        }
        catch {
            return [];
        }
    }
    persist() { this.storage.setStorageSync(copy_1.AI_CHAT_STORAGE_KEY, JSON.stringify(this.state.messages)); }
}
exports.AiPageModel = AiPageModel;
function createOnlineStatus() {
    var _a;
    let online = true;
    wx.getNetworkType({ success: (result) => { online = result.networkType !== 'none'; }, fail: () => { online = false; } });
    (_a = wx.onNetworkStatusChange) === null || _a === void 0 ? void 0 : _a.call(wx, (result) => { online = result.isConnected !== false && result.networkType !== 'none'; });
    return () => online;
}
function createAiPage(model) {
    return {
        data: model.state,
        async onShow() { await model.hydrate(); this.setData(model.state); },
        async send(event) { var _a, _b; await model.send((_b = (_a = event.detail) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : ''); this.setData(model.state); },
        onInput(event) { var _a, _b; model.setDraft((_b = (_a = event.detail) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : ''); this.setData(model.state); },
        async sendCurrent() { await model.sendCurrent(); this.setData(model.state); },
        async quickQuestion(event) { var _a, _b, _c; await model.send((_c = (_b = (_a = event.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.question) !== null && _c !== void 0 ? _c : ''); this.setData(model.state); },
        async deleteHistory() { await model.deleteHistory(); this.setData(model.state); },
    };
}
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
    const runtime = (0, app_1.getRuntime)();
    const model = new AiPageModel(runtime.api, createOnlineStatus(), (route) => wx.reLaunch({ url: route }), runtime.storage);
    Page((0, themed_page_1.withThemePage)(createAiPage(model), runtime.theme));
}
