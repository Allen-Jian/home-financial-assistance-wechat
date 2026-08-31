import type { StorageLike } from '../auth/session-store';
import { DARK_TOKENS, LIGHT_TOKENS, type ThemeTokens } from './theme';

export const THEME_STORAGE_KEY = 'family-ledger.theme.v1';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export interface ThemeSnapshot {
  preference: ThemePreference;
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  themeClass: string;
  themeBackground: string;
  themePageStyle: string;
  tokens: ThemeTokens;
}
export interface ThemeNative {
  getSystemTheme(): ResolvedTheme;
  onThemeChange?(listener: (result: { theme: ResolvedTheme }) => void): void;
  offThemeChange?(listener: (result: { theme: ResolvedTheme }) => void): void;
  setNavigationBarColor?(options: { frontColor: string; backgroundColor: string }): void;
  setBackgroundColor?(options: {
    backgroundColor: string;
    backgroundColorTop: string;
    backgroundColorBottom: string;
  }): void;
}

type WxTheme = {
  getSystemInfoSync?: () => { theme?: unknown };
  onThemeChange?: (listener: (result: { theme: ResolvedTheme }) => void) => void;
  offThemeChange?: (listener: (result: { theme: ResolvedTheme }) => void) => void;
  setNavigationBarColor?: (options: { frontColor: string; backgroundColor: string }) => void;
  setBackgroundColor?: (options: {
    backgroundColor: string;
    backgroundColorTop: string;
    backgroundColorBottom: string;
  }) => void;
};

declare const wx: WxTheme;

function isResolvedTheme(value: unknown): value is ResolvedTheme {
  return value === 'light' || value === 'dark';
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function createWxThemeNative(): ThemeNative {
  const runtime = typeof wx === 'undefined' ? undefined : wx;
  return {
    getSystemTheme: () => {
      const theme = runtime?.getSystemInfoSync?.().theme;
      return isResolvedTheme(theme) ? theme : 'light';
    },
    onThemeChange: (listener) => runtime?.onThemeChange?.(listener),
    offThemeChange: (listener) => runtime?.offThemeChange?.(listener),
    setNavigationBarColor: (options) => runtime?.setNavigationBarColor?.(options),
    setBackgroundColor: (options) => runtime?.setBackgroundColor?.(options),
  };
}

export class ThemeRuntime {
  private preference: ThemePreference;
  private systemTheme: ResolvedTheme;
  private snapshot: ThemeSnapshot;
  private readonly listeners = new Set<(snapshot: ThemeSnapshot) => void>();
  private readonly systemThemeListener: (result: { theme: ResolvedTheme }) => void;

  constructor(
    private readonly storage: StorageLike,
    private readonly native: ThemeNative = createWxThemeNative(),
  ) {
    this.preference = this.readPreference();
    this.systemTheme = this.readSystemTheme();
    this.systemThemeListener = ({ theme }) => {
      if (this.preference !== 'system' || !isResolvedTheme(theme)) return;
      this.systemTheme = theme;
      this.publish();
    };
    this.native.onThemeChange?.(this.systemThemeListener);
    this.snapshot = this.publish();
  }

  getSnapshot(): ThemeSnapshot {
    return this.snapshot;
  }

  setPreference(value: ThemePreference): { persisted: boolean; snapshot: ThemeSnapshot } {
    this.preference = isThemePreference(value) ? value : 'system';
    let persisted = true;
    try {
      this.storage.setStorageSync(THEME_STORAGE_KEY, JSON.stringify(this.preference));
    } catch {
      persisted = false;
    }
    if (this.preference === 'system') this.systemTheme = this.readSystemTheme();
    return { persisted, snapshot: this.publish() };
  }

  subscribe(listener: (snapshot: ThemeSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.native.offThemeChange?.(this.systemThemeListener);
    this.listeners.clear();
  }

  private readPreference(): ThemePreference {
    try {
      const raw = this.storage.getStorageSync(THEME_STORAGE_KEY);
      if (typeof raw !== 'string') return 'system';
      const parsed: unknown = JSON.parse(raw);
      return isThemePreference(parsed) ? parsed : 'system';
    } catch {
      return 'system';
    }
  }

  private readSystemTheme(): ResolvedTheme {
    try {
      const theme = this.native.getSystemTheme();
      return isResolvedTheme(theme) ? theme : 'light';
    } catch {
      return 'light';
    }
  }

  private publish(): ThemeSnapshot {
    const resolvedTheme = this.preference === 'system' ? this.systemTheme : this.preference;
    const tokens = resolvedTheme === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;
    this.snapshot = {
      preference: this.preference,
      themePreference: this.preference,
      resolvedTheme,
      themeClass: `theme-${resolvedTheme}`,
      themeBackground: tokens.background,
      themePageStyle: `background-color: ${tokens.background};`,
      tokens,
    };

    try {
      this.native.setNavigationBarColor?.({
        frontColor: resolvedTheme === 'dark' ? '#FFFFFF' : '#000000',
        backgroundColor: tokens.background,
      });
    } catch {
      // Native color APIs are best-effort; page subscribers still receive the theme.
    }
    try {
      this.native.setBackgroundColor?.({
        backgroundColor: tokens.background,
        backgroundColorTop: tokens.background,
        backgroundColorBottom: tokens.background,
      });
    } catch {
      // Native color APIs are best-effort; page subscribers still receive the theme.
    }
    for (const listener of this.listeners) listener(this.snapshot);
    return this.snapshot;
  }
}
