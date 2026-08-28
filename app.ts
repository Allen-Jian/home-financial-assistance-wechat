import type { Session } from './src/auth/session-store';
import type { StorageLike, SessionStore } from './src/auth/session-store';
import { ApiError } from './src/api/client';
import { AI_CHAT_STORAGE_KEY } from './src/shared/copy';

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
if (typeof App !== 'undefined') {
  App({
    globalData: {
      session: null,
    },
  });
}
