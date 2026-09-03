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
const theme_runtime_1 = require("../shared/theme-runtime");
const connectivity_runtime_1 = require("./connectivity-runtime");
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
    const connectivity = new connectivity_runtime_1.ConnectivityRuntime();
    const api = new client_1.ApiClient({ baseUrl: config.apiBaseUrl, sessions, cache, connectivity });
    const auth = new wechat_auth_1.WechatAuth(config, (0, wechat_auth_1.createWxLoginPort)(), api);
    const theme = new theme_runtime_1.ThemeRuntime(storage);
    return { config, storage, sessions, cache, api, auth, theme, connectivity };
}
