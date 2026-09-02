import { createAppRuntime } from '../src/runtime/app-runtime';
import type { StorageLike } from '../src/auth/session-store';

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();
  getStorageSync(key: string): unknown { return this.values.get(key); }
  setStorageSync(key: string, value: string): void { this.values.set(key, value); }
  removeStorageSync(key: string): void { this.values.delete(key); }
}

test('creates a production runtime with real WeChat authentication enabled', () => {
  const runtime = createAppRuntime(new MemoryStorage(), {
    API_BASE_URL: 'https://ledger-api.allenjian.fun/v1',
    WECHAT_APP_ID: 'wxff77e75108c26871',
    MOCK_AUTH: 'false',
    NODE_ENV: 'production',
  });

  expect(runtime.config).toEqual({
    apiBaseUrl: 'https://ledger-api.allenjian.fun/v1',
    mockAuth: false,
  });
  expect(runtime.sessions.read()).toBeNull();
  expect(runtime.storage).toBeDefined();
  expect(runtime.api).toBeDefined();
  expect(runtime.auth).toBeDefined();
  expect(runtime.theme).toBeDefined();
  expect(runtime.theme.getSnapshot()).toMatchObject({
    preference: 'system',
    resolvedTheme: 'light',
  });
});

test('production API transport stays blocked until connectivity is confirmed and restores after status changes', async () => {
  let networkOptions!: { success: (result: { networkType?: string }) => void; fail?: () => void };
  let networkListener!: (result: { isConnected?: boolean; networkType?: string }) => void;
  const offNetworkStatusChange = jest.fn();
  const requests: string[] = [];
  const uploads: string[] = [];
  const previousWx = (globalThis as { wx?: unknown }).wx;
  (globalThis as { wx?: unknown }).wx = {
    getNetworkType: (options: typeof networkOptions) => { networkOptions = options; },
    onNetworkStatusChange: (listener: typeof networkListener) => { networkListener = listener; },
    offNetworkStatusChange,
    request: (options: { url: string; success: (response: unknown) => void }) => { requests.push(options.url); options.success({ statusCode: 200, data: { ok: true } }); },
    uploadFile: (options: { url: string; success: (response: unknown) => void }) => { uploads.push(options.url); options.success({ statusCode: 200, data: { ok: true } }); },
  };
  try {
    const runtime = createAppRuntime(new MemoryStorage(), { API_BASE_URL: 'https://ledger.test/v1', WECHAT_APP_ID: 'wx-test', MOCK_AUTH: 'false', NODE_ENV: 'production' });

    expect(runtime.connectivity.isOnline()).toBe(false);
    await expect(runtime.api.get('/reports/summary')).rejects.toMatchObject({ code: 'network', message: expect.stringContaining('network') });
    await expect(runtime.api.upload('/attachments', { filePath: '/tmp/file', name: 'file' })).rejects.toMatchObject({ code: 'network' });
    expect(requests).toEqual([]);
    expect(uploads).toEqual([]);

    networkOptions.success({ networkType: 'wifi' });
    await expect(runtime.api.get('/reports/summary')).resolves.toEqual({ ok: true });
    expect(requests).toHaveLength(1);

    networkListener({ networkType: 'none', isConnected: false });
    await expect(runtime.api.get('/reports/summary')).rejects.toMatchObject({ code: 'network' });
    networkListener({ networkType: 'wifi', isConnected: true });
    await expect(runtime.api.upload('/attachments', { filePath: '/tmp/file', name: 'file' })).resolves.toEqual({ ok: true });
    expect(uploads).toHaveLength(1);

    runtime.connectivity.dispose();
    expect(offNetworkStatusChange).toHaveBeenCalledTimes(1);
  } finally {
    (globalThis as { wx?: unknown }).wx = previousWx;
  }
});

test('a failed initial network query remains blocked but later online status restores API calls', async () => {
  let networkOptions!: { success: (result: { networkType?: string }) => void; fail?: () => void };
  let networkListener!: (result: { isConnected?: boolean; networkType?: string }) => void;
  const requests: string[] = [];
  const previousWx = (globalThis as { wx?: unknown }).wx;
  (globalThis as { wx?: unknown }).wx = {
    getNetworkType: (options: typeof networkOptions) => { networkOptions = options; options.fail?.(); },
    onNetworkStatusChange: (listener: typeof networkListener) => { networkListener = listener; },
    request: (options: { url: string; success: (response: unknown) => void }) => { requests.push(options.url); options.success({ statusCode: 200, data: { restored: true } }); },
  };
  try {
    const runtime = createAppRuntime(new MemoryStorage(), { API_BASE_URL: 'https://ledger.test/v1', WECHAT_APP_ID: 'wx-test', MOCK_AUTH: 'false', NODE_ENV: 'production' });
    expect(runtime.connectivity.isOnline()).toBe(false);
    await expect(runtime.api.get('/reports/summary')).rejects.toMatchObject({ code: 'network' });
    expect(requests).toEqual([]);

    networkListener({ networkType: '4g', isConnected: true });
    await expect(runtime.api.get('/reports/summary')).resolves.toEqual({ restored: true });
    expect(requests).toHaveLength(1);
    networkOptions.success({ networkType: 'none' });
    await expect(runtime.api.get('/reports/summary')).rejects.toMatchObject({ code: 'network' });
  } finally {
    (globalThis as { wx?: unknown }).wx = previousWx;
  }
});
