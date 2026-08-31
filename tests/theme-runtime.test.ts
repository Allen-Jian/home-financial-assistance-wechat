import { DARK_TOKENS, LIGHT_TOKENS } from '../src/shared/theme';
import {
  THEME_STORAGE_KEY,
  ThemeRuntime,
  type ThemeNative,
} from '../src/shared/theme-runtime';
import type { StorageLike } from '../src/auth/session-store';

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();

  getStorageSync(key: string): unknown {
    return this.values.get(key);
  }

  setStorageSync(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeStorageSync(key: string): void {
    this.values.delete(key);
  }
}

function nativeTheme(initial: 'light' | 'dark' = 'light') {
  let systemTheme = initial;
  let onThemeChange: ((result: { theme: 'light' | 'dark' }) => void) | undefined;
  const native: ThemeNative = {
    getSystemTheme: () => systemTheme,
    onThemeChange: (listener: (result: { theme: 'light' | 'dark' }) => void) => { onThemeChange = listener; },
    offThemeChange: () => { onThemeChange = undefined; },
    setNavigationBarColor: jest.fn(),
    setBackgroundColor: jest.fn(),
  };
  return {
    native,
    changeSystemTheme(theme: 'light' | 'dark') {
      systemTheme = theme;
      onThemeChange?.({ theme });
    },
  };
}

test.each([
  [undefined, 'system'],
  ['not-json', 'system'],
  [JSON.stringify('sepia'), 'system'],
])('falls back to system for missing, damaged, or unknown preference (%p)', (stored, preference) => {
  const storage = new MemoryStorage();
  if (stored !== undefined) storage.values.set(THEME_STORAGE_KEY, stored);
  const system = nativeTheme('dark');
  const runtime = new ThemeRuntime(storage, system.native);

  expect(runtime.getSnapshot()).toMatchObject({ preference, resolvedTheme: 'dark' });
});

test('manual preference ignores later system theme changes', () => {
  const storage = new MemoryStorage();
  const system = nativeTheme('light');
  const runtime = new ThemeRuntime(storage, system.native);

  runtime.setPreference('dark');
  system.changeSystemTheme('light');

  expect(runtime.getSnapshot()).toMatchObject({ preference: 'dark', resolvedTheme: 'dark' });
});

test('applies the current session when preference persistence fails', () => {
  const storage: StorageLike = {
    getStorageSync: () => undefined,
    setStorageSync: () => { throw new Error('storage unavailable'); },
    removeStorageSync: jest.fn(),
  };
  const system = nativeTheme();
  const runtime = new ThemeRuntime(storage, system.native);
  const listener = jest.fn();
  runtime.subscribe(listener);

  const result = runtime.setPreference('dark');

  expect(result.persisted).toBe(false);
  expect(result.snapshot).toMatchObject({ preference: 'dark', resolvedTheme: 'dark' });
  expect(runtime.getSnapshot()).toEqual(result.snapshot);
  expect(listener).toHaveBeenLastCalledWith(result.snapshot);
});

test('publishes one resolved theme to subscribers and native color interfaces', () => {
  const storage = new MemoryStorage();
  const system = nativeTheme();
  const runtime = new ThemeRuntime(storage, system.native);
  const listener = jest.fn();
  runtime.subscribe(listener);

  const result = runtime.setPreference('dark');
  const nav = system.native.setNavigationBarColor as jest.Mock;
  const background = system.native.setBackgroundColor as jest.Mock;

  expect(listener).toHaveBeenLastCalledWith(result.snapshot);
  expect(result.snapshot.tokens).toEqual(DARK_TOKENS);
  expect(nav).toHaveBeenLastCalledWith({
    frontColor: '#FFFFFF',
    backgroundColor: DARK_TOKENS.background,
  });
  expect(background).toHaveBeenLastCalledWith({
    backgroundColor: DARK_TOKENS.background,
    backgroundColorTop: DARK_TOKENS.background,
    backgroundColorBottom: DARK_TOKENS.background,
  });
  expect(result.snapshot.tokens).not.toBe(LIGHT_TOKENS);
});

test('does not block page updates when native color interfaces fail', () => {
  const storage = new MemoryStorage();
  const system = nativeTheme();
  system.native.setNavigationBarColor = () => { throw new Error('navigation unavailable'); };
  system.native.setBackgroundColor = () => { throw new Error('background unavailable'); };
  const runtime = new ThemeRuntime(storage, system.native);
  const listener = jest.fn();
  runtime.subscribe(listener);

  const result = runtime.setPreference('dark');

  expect(result.snapshot.resolvedTheme).toBe('dark');
  expect(listener).toHaveBeenLastCalledWith(result.snapshot);
});
