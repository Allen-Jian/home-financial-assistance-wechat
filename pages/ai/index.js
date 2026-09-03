"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiPageModel = exports.QUICK_QUESTIONS = void 0;
exports.calculateChatInsets = calculateChatInsets;
exports.createAiPage = createAiPage;
const client_1 = require("../../src/api/client");
const copy_1 = require("../../src/shared/copy");
const app_1 = require("../../app");
const money_1 = require("../../src/domain/money");
const themed_page_1 = require("../../src/shared/themed-page");
exports.QUICK_QUESTIONS = ['本月花最多的分类？', '找出异常支出', '比较本季与上季'];
const CHAT_END_ID = 'chat-end';
const COMPOSER_GAP_PX = 8;
const LIST_GAP_PX = 12;
const CUSTOM_TAB_HEIGHT_RPX = 112;
const RAISED_ACTION_DIAMETER_RPX = 86;
// The raised action clears the tab bar by approximately half its diameter.
const RAISED_ACTION_PROTRUSION_RPX = RAISED_ACTION_DIAMETER_RPX / 2;
// Keep the composer above the action's shadow and leave a small visual gap.
const CLOSED_ACTION_GAP_RPX = 21;
const CLOSED_CUSTOM_TAB_CLEARANCE_RPX = CUSTOM_TAB_HEIGHT_RPX + RAISED_ACTION_PROTRUSION_RPX + CLOSED_ACTION_GAP_RPX;
const DEFAULT_WINDOW_WIDTH_PX = 375;
function nonNegativeFinite(value, fallback = 0) {
    return Number.isFinite(value) ? Math.max(0, value) : fallback;
}
function calculateChatInsets(keyboard, composer, safe, windowWidth = DEFAULT_WINDOW_WIDTH_PX) {
    const keyboardHeightPx = nonNegativeFinite(keyboard);
    const composerHeightPx = nonNegativeFinite(composer);
    const safeAreaBottomPx = nonNegativeFinite(safe);
    const windowWidthPx = nonNegativeFinite(windowWidth, DEFAULT_WINDOW_WIDTH_PX);
    const customTabClearancePx = CLOSED_CUSTOM_TAB_CLEARANCE_RPX * windowWidthPx / 750;
    const composerBottomPx = keyboardHeightPx > 0
        ? keyboardHeightPx + COMPOSER_GAP_PX
        : customTabClearancePx + safeAreaBottomPx;
    return { composerBottomPx, listBottomInsetPx: composerBottomPx + composerHeightPx + LIST_GAP_PX };
}
function citationDisplay(citation) {
    const occurredAt = typeof citation.occurredAt === 'string' ? citation.occurredAt : '';
    const date = occurredAt ? new Date(occurredAt) : null;
    const occurredAtDisplay = date && !Number.isNaN(date.valueOf())
        ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Pacific/Auckland', month: 'numeric', day: 'numeric' }).format(date)
        : occurredAt || undefined;
    return {
        ...citation,
        amountDisplay: (0, money_1.formatNzdMinor)(citation.amountMinor),
        ...(occurredAtDisplay ? { occurredAtDisplay } : {}),
    };
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
        this.operationEpoch = 0;
        this.inFlightSend = null;
        const composerHeightPx = 60;
        const insets = calculateChatInsets(0, composerHeightPx, 0, DEFAULT_WINDOW_WIDTH_PX);
        this.state = {
            quickQuestions: exports.QUICK_QUESTIONS,
            messages: this.readHistory(),
            loading: false,
            error: '',
            notice: copy_1.copy.aiReadOnlyNotice,
            conversationId: '',
            draft: '',
            keyboardHeightPx: 0,
            composerHeightPx,
            ...insets,
            scrollTarget: '',
        };
    }
    async hydrate(isCurrent = () => true) {
        if (!this.isOnline() || !this.api.listAiConversations)
            return;
        this.inFlightSend = null;
        this.state.loading = false;
        const epoch = ++this.operationEpoch;
        const shouldApply = () => epoch === this.operationEpoch && isCurrent();
        try {
            const conversations = await this.api.listAiConversations();
            if (!shouldApply())
                return;
            this.state.error = '';
            const latest = conversations[0];
            if (!latest)
                return;
            const messages = Array.isArray(latest.messages) ? latest.messages.map((message) => {
                const content = typeof message.contentJson === 'object' && message.contentJson !== null ? message.contentJson : {};
                return {
                    role: message.role,
                    content: typeof content.answer === 'string' ? content.answer : typeof content.text === 'string' ? content.text : '',
                    scope: content.scope,
                    citations: Array.isArray(content.citations) ? content.citations.map(citationDisplay) : undefined,
                    insights: Array.isArray(content.insights) ? content.insights : undefined,
                };
            }).filter((message) => message.content) : undefined;
            if (!shouldApply())
                return;
            this.state.conversationId = latest.id;
            if (messages)
                this.state.messages = messages;
            if (!shouldApply())
                return;
            this.persist();
        }
        catch {
            if (!shouldApply())
                return;
            /* cached chat remains visible */
        }
    }
    send(message) {
        const value = message.trim();
        if (!value)
            return Promise.resolve(false);
        if (!this.isOnline()) {
            this.state.error = copy_1.copy.networkRequired;
            return Promise.resolve(false);
        }
        if (this.inFlightSend)
            return this.inFlightSend;
        const epoch = ++this.operationEpoch;
        this.state.loading = true;
        this.state.error = '';
        this.state.messages.push({ role: 'user', content: value });
        this.persist();
        const pending = (async () => {
            var _a, _b;
            const isCurrent = () => epoch === this.operationEpoch;
            try {
                const result = await this.api.askAi({ conversationId: this.state.conversationId || undefined, message: value });
                if (!isCurrent())
                    return false;
                this.state.conversationId = result.conversationId || this.state.conversationId;
                this.state.messages.push({ role: 'assistant', content: result.answer, scope: result.scope, citations: ((_a = result.citations) !== null && _a !== void 0 ? _a : []).map(citationDisplay), insights: (_b = result.insights) !== null && _b !== void 0 ? _b : [] });
                this.persist();
                return true;
            }
            catch (error) {
                if (!isCurrent())
                    return false;
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
                if (isCurrent())
                    this.state.loading = false;
            }
        })();
        this.inFlightSend = pending;
        pending.then(() => {
            if (this.inFlightSend === pending)
                this.inFlightSend = null;
        });
        return pending;
    }
    setDraft(value) { this.state.draft = value; }
    async sendCurrent() {
        if (this.inFlightSend)
            return false;
        const submitted = this.state.draft;
        const sent = await this.send(submitted);
        if (sent && this.state.draft === submitted)
            this.state.draft = '';
        return sent;
    }
    deleteHistory() {
        this.operationEpoch += 1;
        this.inFlightSend = null;
        const conversationId = this.state.conversationId;
        this.state.messages = [];
        this.state.conversationId = '';
        this.state.loading = false;
        this.state.error = '';
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
function wxRuntime() {
    return typeof wx === 'undefined' ? undefined : wx;
}
function viewportMetrics() {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const info = (_b = (_a = wxRuntime()) === null || _a === void 0 ? void 0 : _a.getSystemInfoSync) === null || _b === void 0 ? void 0 : _b.call(_a);
    const inset = (_c = info === null || info === void 0 ? void 0 : info.safeAreaInsets) === null || _c === void 0 ? void 0 : _c.bottom;
    if (typeof inset === 'number' && Number.isFinite(inset))
        return { safeAreaBottomPx: nonNegativeFinite(inset), windowWidthPx: nonNegativeFinite((_d = info === null || info === void 0 ? void 0 : info.windowWidth) !== null && _d !== void 0 ? _d : DEFAULT_WINDOW_WIDTH_PX, DEFAULT_WINDOW_WIDTH_PX) };
    const safeBottom = (_e = info === null || info === void 0 ? void 0 : info.safeArea) === null || _e === void 0 ? void 0 : _e.bottom;
    if (typeof safeBottom !== 'number' || !Number.isFinite(safeBottom))
        return { safeAreaBottomPx: 0, windowWidthPx: nonNegativeFinite((_f = info === null || info === void 0 ? void 0 : info.windowWidth) !== null && _f !== void 0 ? _f : DEFAULT_WINDOW_WIDTH_PX, DEFAULT_WINDOW_WIDTH_PX) };
    if (typeof (info === null || info === void 0 ? void 0 : info.screenHeight) === 'number' && Number.isFinite(info.screenHeight)) {
        return { safeAreaBottomPx: nonNegativeFinite(info.screenHeight - safeBottom), windowWidthPx: nonNegativeFinite((_g = info === null || info === void 0 ? void 0 : info.windowWidth) !== null && _g !== void 0 ? _g : DEFAULT_WINDOW_WIDTH_PX, DEFAULT_WINDOW_WIDTH_PX) };
    }
    return { safeAreaBottomPx: nonNegativeFinite(safeBottom), windowWidthPx: nonNegativeFinite((_h = info === null || info === void 0 ? void 0 : info.windowWidth) !== null && _h !== void 0 ? _h : DEFAULT_WINDOW_WIDTH_PX, DEFAULT_WINDOW_WIDTH_PX) };
}
function pageSafeArea(page) {
    const metrics = viewportMetrics();
    page.__safeAreaBottomPx = metrics.safeAreaBottomPx;
    page.__windowWidthPx = metrics.windowWidthPx;
}
function applyChatInsets(model, page, keyboardHeightPx = model.state.keyboardHeightPx) {
    var _a, _b;
    const insets = calculateChatInsets(keyboardHeightPx, model.state.composerHeightPx, (_a = page.__safeAreaBottomPx) !== null && _a !== void 0 ? _a : 0, (_b = page.__windowWidthPx) !== null && _b !== void 0 ? _b : DEFAULT_WINDOW_WIDTH_PX);
    model.state.keyboardHeightPx = nonNegativeFinite(keyboardHeightPx);
    model.state.composerBottomPx = insets.composerBottomPx;
    model.state.listBottomInsetPx = insets.listBottomInsetPx;
    page.setData({ keyboardHeightPx: model.state.keyboardHeightPx, composerBottomPx: insets.composerBottomPx, listBottomInsetPx: insets.listBottomInsetPx });
}
function updateComposerHeight(model, page, height) {
    if (!Number.isFinite(height))
        return;
    model.state.composerHeightPx = nonNegativeFinite(height, model.state.composerHeightPx);
    applyChatInsets(model, page);
    scrollToChatEnd(model, page);
}
function pageToken(page) {
    var _a;
    return (_a = page.__lifecycleGeneration) !== null && _a !== void 0 ? _a : 0;
}
function isPageActive(page, token) {
    return page.__active !== false && pageToken(page) === token;
}
function beginPageLifecycle(page) {
    page.__lifecycleGeneration = pageToken(page) + 1;
    page.__active = true;
    return page.__lifecycleGeneration;
}
function invalidatePageLifecycle(page) {
    page.__lifecycleGeneration = pageToken(page) + 1;
    page.__active = false;
}
function scrollToChatEnd(model, page, token = pageToken(page)) {
    if (!isPageActive(page, token))
        return;
    model.state.scrollTarget = '';
    page.setData({ scrollTarget: '' });
    const commit = () => {
        if (!isPageActive(page, token))
            return;
        model.state.scrollTarget = CHAT_END_ID;
        page.setData({ scrollTarget: CHAT_END_ID });
    };
    const runtime = wxRuntime();
    if (runtime === null || runtime === void 0 ? void 0 : runtime.nextTick)
        runtime.nextTick(commit);
    else
        commit();
}
function measureComposer(model, page, token = pageToken(page)) {
    var _a;
    const query = (_a = page.createSelectorQuery) === null || _a === void 0 ? void 0 : _a.call(page);
    if (!query)
        return;
    const target = query.select('.composer');
    let measured = false;
    const applyMeasurement = (result) => {
        if (!isPageActive(page, token))
            return;
        const rect = Array.isArray(result) ? result[0] : result;
        if (!rect || typeof rect.height !== 'number' || !Number.isFinite(rect.height))
            return;
        measured = true;
        updateComposerHeight(model, page, rect.height);
    };
    target.boundingClientRect(applyMeasurement);
    query.exec((rects) => { if (!measured)
        applyMeasurement(rects); });
}
function registerKeyboardListener(model, page) {
    const runtime = wxRuntime();
    if (!(runtime === null || runtime === void 0 ? void 0 : runtime.onKeyboardHeightChange) || page.__keyboardListener)
        return;
    const listener = (result) => {
        const token = pageToken(page);
        if (!isPageActive(page, token))
            return;
        const keyboardHeightPx = typeof (result === null || result === void 0 ? void 0 : result.height) === 'number' && Number.isFinite(result.height) ? result.height : 0;
        applyChatInsets(model, page, keyboardHeightPx);
        measureComposer(model, page, token);
        scrollToChatEnd(model, page, token);
    };
    page.__keyboardListener = listener;
    runtime.onKeyboardHeightChange(listener);
}
function resetKeyboardListener(model, page) {
    var _a, _b, _c;
    const runtime = wxRuntime();
    const listener = page.__keyboardListener;
    if (listener)
        (_a = runtime === null || runtime === void 0 ? void 0 : runtime.offKeyboardHeightChange) === null || _a === void 0 ? void 0 : _a.call(runtime, listener);
    page.__keyboardListener = undefined;
    const insets = calculateChatInsets(0, model.state.composerHeightPx, (_b = page.__safeAreaBottomPx) !== null && _b !== void 0 ? _b : 0, (_c = page.__windowWidthPx) !== null && _c !== void 0 ? _c : DEFAULT_WINDOW_WIDTH_PX);
    model.state.keyboardHeightPx = 0;
    model.state.composerBottomPx = insets.composerBottomPx;
    model.state.listBottomInsetPx = insets.listBottomInsetPx;
}
async function refreshAfterOperation(model, page, operation) {
    const token = pageToken(page);
    const pending = operation();
    if (!isPageActive(page, token)) {
        await pending;
        return;
    }
    page.setData(model.state);
    scrollToChatEnd(model, page, token);
    await pending;
    if (!isPageActive(page, token))
        return;
    page.setData(model.state);
    measureComposer(model, page, token);
    scrollToChatEnd(model, page, token);
}
function createAiPage(model) {
    return {
        data: model.state,
        async onShow() {
            var _a, _b;
            const token = beginPageLifecycle(this);
            pageSafeArea(this);
            applyChatInsets(model, this, 0);
            this.setData(model.state);
            scrollToChatEnd(model, this, token);
            registerKeyboardListener(model, this);
            (_b = (_a = this.getTabBar) === null || _a === void 0 ? void 0 : _a.call(this)) === null || _b === void 0 ? void 0 : _b.setData({ selected: 3 });
            await model.hydrate(() => isPageActive(this, token));
            if (!isPageActive(this, token))
                return;
            this.setData(model.state);
            measureComposer(model, this, token);
            scrollToChatEnd(model, this, token);
        },
        async send(event) { await refreshAfterOperation(model, this, () => { var _a, _b; return model.send((_b = (_a = event.detail) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : ''); }); },
        onInput(event) { var _a, _b; const token = pageToken(this); model.setDraft((_b = (_a = event.detail) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : ''); if (!isPageActive(this, token))
            return; this.setData(model.state); measureComposer(model, this, token); scrollToChatEnd(model, this, token); },
        onComposerLineChange(event) {
            var _a;
            const token = pageToken(this);
            if (!isPageActive(this, token))
                return;
            if (this.createSelectorQuery)
                measureComposer(model, this, token);
            else if (typeof ((_a = event === null || event === void 0 ? void 0 : event.detail) === null || _a === void 0 ? void 0 : _a.height) === 'number')
                updateComposerHeight(model, this, event.detail.height);
        },
        onComposerResize(event) {
            var _a;
            const token = pageToken(this);
            if (!isPageActive(this, token))
                return;
            if (this.createSelectorQuery)
                measureComposer(model, this, token);
            else if (typeof ((_a = event === null || event === void 0 ? void 0 : event.detail) === null || _a === void 0 ? void 0 : _a.height) === 'number')
                updateComposerHeight(model, this, event.detail.height);
        },
        async sendCurrent() { await refreshAfterOperation(model, this, () => model.sendCurrent()); },
        async quickQuestion(event) { await refreshAfterOperation(model, this, () => { var _a, _b, _c; return model.send((_c = (_b = (_a = event.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.question) !== null && _c !== void 0 ? _c : ''); }); },
        async deleteHistory() { const token = pageToken(this); await model.deleteHistory(); if (!isPageActive(this, token))
            return; this.setData(model.state); scrollToChatEnd(model, this, token); },
        onHide() { invalidatePageLifecycle(this); resetKeyboardListener(model, this); },
        onUnload() { invalidatePageLifecycle(this); resetKeyboardListener(model, this); },
    };
}
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
    const runtime = (0, app_1.getRuntime)();
    const model = new AiPageModel(runtime.api, () => runtime.connectivity.isOnline(), (route) => wx.reLaunch({ url: route }), runtime.storage);
    Page((0, themed_page_1.withThemePage)(createAiPage(model), runtime.theme));
}
