import { ApiClient } from '../api/client';
import { SessionStore, type StorageLike } from '../auth/session-store';
import { WechatAuth, createWxLoginPort } from '../auth/wechat-auth';
import { ReadCache } from '../cache/read-cache';
import { getAppConfig, type AppConfig, type ConfigEnv } from '../shared/config';
import { runtimeConfig } from '../shared/runtime-config';
import { ThemeRuntime } from '../shared/theme-runtime';
import { ConnectivityRuntime } from './connectivity-runtime';

export interface AppRuntime {
  config: AppConfig;
  storage: StorageLike;
  sessions: SessionStore;
  cache: ReadCache;
  api: ApiClient;
  auth: WechatAuth;
  theme: ThemeRuntime;
  connectivity: ConnectivityRuntime;
}

interface WxStorageRuntime extends StorageLike {}
declare const wx: WxStorageRuntime;

export function createWxStorage(): StorageLike {
  return {
    getStorageSync: (key) => wx.getStorageSync(key),
    setStorageSync: (key, value) => wx.setStorageSync(key, value),
    removeStorageSync: (key) => wx.removeStorageSync(key),
  };
}

export function createAppRuntime(storage: StorageLike, env: ConfigEnv = runtimeConfig): AppRuntime {
  const config = getAppConfig(env);
  const sessions = new SessionStore(storage);
  const cache = new ReadCache(storage);
  const connectivity = new ConnectivityRuntime();
  const api = new ApiClient({ baseUrl: config.apiBaseUrl, sessions, cache, connectivity });
  const auth = new WechatAuth(config, createWxLoginPort(), api);
  const theme = new ThemeRuntime(storage);
  return { config, storage, sessions, cache, api, auth, theme, connectivity };
}
