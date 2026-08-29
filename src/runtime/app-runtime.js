"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWxStorage = createWxStorage;
exports.createAppRuntime = createAppRuntime;
const client_1 = require("../api/client");
const session_store_1 = require("../auth/session-store");
const wechat_auth_1 = require("../auth/wechat-auth");
const read_cache_1 = require("../cache/read-cache");
const config_1 = require("../shared/config");
const runtime_config_1 = require("../shared/runtime-config");
function createWxStorage() {
    return {
        getStorageSync: (key) => wx.getStorageSync(key),
        setStorageSync: (key, value) => wx.setStorageSync(key, value),
        removeStorageSync: (key) => wx.removeStorageSync(key),
    };
}
function createAppRuntime(storage, env = runtime_config_1.runtimeConfig) {
    const config = (0, config_1.getAppConfig)(env);
    const sessions = new session_store_1.SessionStore(storage);
    const cache = new read_cache_1.ReadCache(storage);
    const api = new client_1.ApiClient({ baseUrl: config.apiBaseUrl, sessions, cache });
    const auth = new wechat_auth_1.WechatAuth(config, (0, wechat_auth_1.createWxLoginPort)(), api);
    return { config, storage, sessions, cache, api, auth };
}
