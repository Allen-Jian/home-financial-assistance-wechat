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
