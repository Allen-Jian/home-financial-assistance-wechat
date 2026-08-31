import type { ThemeSnapshot } from './theme-runtime';

export interface ThemePageRuntime {
  getSnapshot(): ThemeSnapshot;
  subscribe(listener: (snapshot: ThemeSnapshot) => void): () => void;
}

export interface ThemePageContext {
  setData(data: unknown): void;
  __offTheme?: () => void;
}

type PageHandler = (this: ThemePageContext, ...args: unknown[]) => unknown;

export function withThemePage<T extends object>(
  definition: T,
  theme: ThemePageRuntime,
): T & { data: Record<string, unknown> } {
  const source = definition as T & { data?: object; onLoad?: PageHandler; onUnload?: PageHandler };
  const originalOnLoad = source.onLoad;
  const originalOnUnload = source.onUnload;
  const wrapped = {
    ...definition,
    data: { ...source.data, ...theme.getSnapshot() },
    onLoad(this: ThemePageContext, ...args: unknown[]) {
      this.__offTheme = theme.subscribe((snapshot) => this.setData(snapshot));
      return originalOnLoad?.apply(this, args);
    },
    onUnload(this: ThemePageContext, ...args: unknown[]) {
      try {
        return originalOnUnload?.apply(this, args);
      } finally {
        this.__offTheme?.();
        this.__offTheme = undefined;
      }
    },
  };
  return wrapped as T & { data: Record<string, unknown> };
}
