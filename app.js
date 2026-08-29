"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveInitialRoute = resolveInitialRoute;
exports.handleApiError = handleApiError;
exports.clearPrivateSession = clearPrivateSession;
exports.getRuntime = getRuntime;
const client_1 = require("./src/api/client");
const copy_1 = require("./src/shared/copy");
const app_runtime_1 = require("./src/runtime/app-runtime");
function resolveInitialRoute(session) {
    return session ? '/pages/dashboard/index' : '/pages/login/index';
}
function handleApiError(error, navigate) {
    if (error instanceof client_1.ApiError && error.statusCode === 401) {
        navigate('/pages/login/index');
        return 'login';
    }
    if (error instanceof client_1.ApiError && error.statusCode === 409)
        return 'duplicate';
    return 'other';
}
function clearPrivateSession(sessions, storage) {
    sessions.clear();
    storage.removeStorageSync(copy_1.AI_CHAT_STORAGE_KEY);
}
function getRuntime() {
    return getApp().globalData.runtime;
}
if (typeof App !== 'undefined' && typeof wx !== 'undefined') {
    const runtime = (0, app_runtime_1.createAppRuntime)((0, app_runtime_1.createWxStorage)());
    App({
        globalData: {
            runtime,
            session: runtime.sessions.read(),
        },
    });
}
