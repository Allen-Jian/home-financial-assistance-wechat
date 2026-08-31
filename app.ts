import type { Session } from './src/auth/session-store';
import type { StorageLike, SessionStore } from './src/auth/session-store';
import { ApiError } from './src/api/client';
import { AI_CHAT_STORAGE_KEY } from './src/shared/copy';
import { createAppRuntime, createWxStorage, type AppRuntime } from './src/runtime/app-runtime';

export interface AppInstance {
  globalData: {
    runtime: AppRuntime;
    theme: AppRuntime['theme'];
    session: Session | null;
  };
}

export function resolveInitialRoute(session: Session | null): string {
  return session ? '/pages/dashboard/index' : '/pages/login/index';
}

export function handleApiError(error: unknown, navigate: (route: string) => void): 'login' | 'duplicate' | 'other' {
  if (error instanceof ApiError && error.statusCode === 401) { navigate('/pages/login/index'); return 'login'; }
  if (error instanceof ApiError && error.statusCode === 409) return 'duplicate';
  return 'other';
}

export function clearPrivateSession(sessions: SessionStore, storage: StorageLike): void {
  sessions.clear();
  storage.removeStorageSync(AI_CHAT_STORAGE_KEY);
}

declare function App(options: Record<string, unknown>): void;
declare function getApp<T>(): T;
declare const wx: unknown;

export function getRuntime(): AppRuntime {
  return getApp<AppInstance>().globalData.runtime;
}

if (typeof App !== 'undefined' && typeof wx !== 'undefined') {
  const runtime = createAppRuntime(createWxStorage());
  App({
    globalData: {
      runtime,
      theme: runtime.theme,
      session: runtime.sessions.read(),
    },
  });
}
