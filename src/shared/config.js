"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAppConfig = getAppConfig;
function getAppConfig(env) {
    var _a;
    const apiBaseUrl = (_a = env.API_BASE_URL) === null || _a === void 0 ? void 0 : _a.trim();
    if (!apiBaseUrl)
        throw new Error('API_BASE_URL is required');
    const mockAuth = env.MOCK_AUTH === undefined
        ? !env.WECHAT_APP_ID
        : env.MOCK_AUTH.toLowerCase() === 'true';
    if (env.NODE_ENV === 'production' && mockAuth) {
        throw new Error('Mock auth is not allowed in production');
    }
    return { apiBaseUrl, mockAuth };
}
