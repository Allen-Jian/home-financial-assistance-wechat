"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiClient = exports.ApiError = void 0;
exports.createWxRequestPort = createWxRequestPort;
const guards_1 = require("../shared/guards");
function createWxRequestPort() {
    return { request: (options) => wx.request(options), uploadFile: (options) => wx.uploadFile(options) };
}
class ApiError extends Error {
    constructor(statusCode, code, message, details) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.name = 'ApiError';
    }
}
exports.ApiError = ApiError;
function errorCode(statusCode) {
    if (statusCode === 401)
        return 'unauthorized';
    if (statusCode === 409)
        return 'duplicate';
    if (statusCode === 413)
        return 'payload-too-large';
    if (statusCode === 422 || statusCode === 400)
        return 'validation';
    if (statusCode >= 500)
        return 'server';
    return 'unknown';
}
function responseMessage(data, statusCode) {
    if (typeof data === 'string') {
        try {
            return responseMessage(JSON.parse(data), statusCode);
        }
        catch {
            return { message: data };
        }
    }
    if ((0, guards_1.isRecord)(data)) {
        const message = data.message;
        if (Array.isArray(message))
            return { message: message.map(String).join('; '), details: data };
        if (typeof message === 'string')
            return { message, details: data };
        if (typeof data.error === 'string')
            return { message: data.error, details: data };
    }
    return { message: `request failed (${statusCode})`, details: data };
}
function networkError(error) {
    const text = error instanceof Error ? error.message : String(error !== null && error !== void 0 ? error : 'network unavailable');
    const timeout = /timeout|超时/i.test(text);
    return new ApiError(0, timeout ? 'timeout' : 'network', timeout ? 'request timed out' : 'network unavailable', error);
}
class ApiClient {
    constructor(options) {
        var _a, _b;
        this.options = options;
        this.transport = (_a = options.transport) !== null && _a !== void 0 ? _a : createWxRequestPort();
        this.timeout = (_b = options.requestTimeoutMs) !== null && _b !== void 0 ? _b : 15000;
        if (!options.baseUrl.trim())
            throw new Error('API base URL is required');
    }
    get(path, query = {}) {
        return this.requestJson('GET', path, query, true);
    }
    post(path, body = {}) {
        return this.requestJson('POST', path, body, false);
    }
    patch(path, body = {}) {
        return this.requestJson('PATCH', path, body, false);
    }
    upload(path, file) {
        const session = this.options.sessions.read();
        const header = session ? { Authorization: `Bearer ${session.accessToken}` } : {};
        return new Promise((resolve, reject) => {
            var _a;
            try {
                this.transport.uploadFile({
                    url: this.url(path),
                    filePath: file.filePath,
                    name: (_a = file.name) !== null && _a !== void 0 ? _a : 'file',
                    formData: file.formData,
                    header,
                    timeout: this.timeout,
                    success: (response) => {
                        if (response.statusCode >= 200 && response.statusCode < 300) {
                            resolve(this.parseBody(response.data));
                        }
                        else {
                            reject(this.toApiError(response.statusCode, response.data));
                        }
                    },
                    fail: (error) => reject(networkError(error)),
                });
            }
            catch (error) {
                reject(networkError(error));
            }
        });
    }
    async read(path, query = {}, cacheKey = `${path}?${JSON.stringify(query)}`, maxAgeMs = 5 * 60000) {
        var _a, _b;
        try {
            const data = await this.get(path, query);
            (_a = this.options.cache) === null || _a === void 0 ? void 0 : _a.set(cacheKey, data);
            return { data, cachedAt: Date.now(), fromCache: false };
        }
        catch (error) {
            const cached = error instanceof ApiError && (error.code === 'network' || error.code === 'timeout')
                ? (_b = this.options.cache) === null || _b === void 0 ? void 0 : _b.read(cacheKey, maxAgeMs)
                : null;
            if (cached)
                return { ...cached, fromCache: true };
            throw error;
        }
    }
    fetchSummary(period = {}) { return this.get('/reports/summary', period); }
    fetchReports(period) { return this.get('/reports/summary', period); }
    fetchAccounts() { return this.get('/accounts'); }
    fetchCategories() { return this.get('/categories'); }
    createCategory(input) { return this.post('/categories', input); }
    updateCategory(id, input) { return this.patch(`/categories/${encodeURIComponent(id)}`, input); }
    setInitialAsset(amountMinor, expectedVersion) {
        return this.patch('/accounts/primary/opening-balance', { amountMinor, expectedVersion });
    }
    updateOpeningBalance(amountMinor, expectedVersion) {
        return this.setInitialAsset(amountMinor, expectedVersion);
    }
    fetchTermDeposits() { return this.get('/term-deposits'); }
    createTermDeposit(input) { return this.post('/term-deposits', input); }
    closeTermDeposit(id, expectedVersion) {
        return this.post(`/term-deposits/${encodeURIComponent(id)}/close`, { expectedVersion });
    }
    fetchPendingDrafts() { return this.get('/drafts'); }
    fetchRecurring() { return this.get('/recurring'); }
    createRecurring(input) { return this.post('/recurring', input); }
    advanceRecurring(id) { return this.post(`/recurring/${encodeURIComponent(id)}/advance`); }
    createTransaction(input) { return this.post('/transactions', input); }
    stageImport(input) { return this.post('/imports/stage', input); }
    confirmDraft(draftId, input = {}) { return this.post(`/drafts/${encodeURIComponent(draftId)}/confirm`, input); }
    previewDuplicates(input) { return this.post('/duplicate-candidates/preview', input); }
    previewDocument(input) {
        return this.upload('/imports/pdf/preview', { filePath: input.filePath, name: 'file' });
    }
    analyzePhoto(input) {
        return this.previewDocument(input);
    }
    previewAnzCsv(csv) { return this.post('/imports/anz-csv/preview', { csv }); }
    stageAnzCsv(input) { return this.post('/imports/anz-csv/stage', input); }
    parseDraft(input) { return this.post('/ai/parse-draft', { input }); }
    uploadAttachment(input) {
        return this.upload(`/attachments/draft/${encodeURIComponent(input.draftId)}`, { filePath: input.filePath, name: 'file' });
    }
    askAi(input) {
        return this.post('/ai/chat', typeof input === 'string' ? { message: input } : input);
    }
    listAiConversations() { return this.get('/ai/conversations'); }
    deleteAiConversation(id) { return this.requestJson('DELETE', `/ai/conversations/${encodeURIComponent(id)}`, undefined, false); }
    fetchAiInsights(period = {}) { return this.get('/ai/insights', period); }
    fetchMembers() { return this.get('/households/members'); }
    createInvite(expiresInDays = 7) { return this.post('/households/invites', { expiresInDays }); }
    removeMember(membershipId) { return this.requestJson('DELETE', `/households/members/${encodeURIComponent(membershipId)}`, undefined, false); }
    exportTransactions(period, format = 'json') { return this.get('/exports/transactions', { ...period, format }); }
    loginWithWechat(input) { return this.post('/auth/wechat/login', input); }
    async logout() {
        const session = this.options.sessions.read();
        if (!session)
            return;
        try {
            await this.post('/auth/logout', { refreshToken: session.refreshToken });
        }
        finally {
            this.options.sessions.clear();
        }
    }
    async requestJson(method, path, data, canRefresh) {
        try {
            const response = await this.rawRequest(method, path, data);
            if (response.statusCode >= 200 && response.statusCode < 300)
                return this.parseBody(response.data);
            if (response.statusCode === 401 && canRefresh && method === 'GET' && path !== '/auth/refresh' && await this.refresh()) {
                return this.requestJson(method, path, data, false);
            }
            throw this.toApiError(response.statusCode, response.data);
        }
        catch (error) {
            if (error instanceof ApiError)
                throw error;
            throw networkError(error);
        }
    }
    rawRequest(method, path, data) {
        const session = this.options.sessions.read();
        const header = session ? { Authorization: `Bearer ${session.accessToken}` } : {};
        return new Promise((resolve, reject) => {
            try {
                this.transport.request({
                    url: this.url(path, method === 'GET' && (0, guards_1.isRecord)(data) ? data : undefined),
                    method,
                    data: method === 'GET' ? undefined : data,
                    header,
                    timeout: this.timeout,
                    success: resolve,
                    fail: reject,
                });
            }
            catch (error) {
                reject(error);
            }
        });
    }
    async refresh() {
        const current = this.options.sessions.read();
        if (!current)
            return false;
        try {
            const response = await this.rawRequest('POST', '/auth/refresh', { refreshToken: current.refreshToken });
            if (response.statusCode < 200 || response.statusCode >= 300 || !(0, guards_1.isRecord)(response.data)
                || typeof response.data.accessToken !== 'string' || !response.data.accessToken
                || typeof response.data.refreshToken !== 'string' || !response.data.refreshToken)
                throw new Error('refresh failed');
            this.options.sessions.save({
                accessToken: response.data.accessToken,
                refreshToken: response.data.refreshToken,
                householdId: typeof response.data.householdId === 'string' && response.data.householdId
                    ? response.data.householdId
                    : current.householdId,
            });
            return true;
        }
        catch {
            this.options.sessions.clear();
            return false;
        }
    }
    parseBody(data) {
        if (typeof data !== 'string')
            return data;
        try {
            return JSON.parse(data);
        }
        catch {
            return data;
        }
    }
    toApiError(statusCode, data) {
        const result = responseMessage(data, statusCode);
        return new ApiError(statusCode, errorCode(statusCode), result.message, result.details);
    }
    url(path, query) {
        const base = this.options.baseUrl.replace(/\/$/, '');
        const normalized = path.startsWith('/') ? path : `/${path}`;
        if (!query)
            return `${base}${normalized}`;
        const params = Object.entries(query).filter(([, value]) => value !== undefined).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
        return params.length ? `${base}${normalized}?${params.join('&')}` : `${base}${normalized}`;
    }
}
exports.ApiClient = ApiClient;
