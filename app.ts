import type { Session } from './src/auth/session-store';

export function resolveInitialRoute(session: Session | null): string {
  return session ? '/pages/dashboard/index' : '/pages/login/index';
}

declare function App(options: Record<string, unknown>): void;
if (typeof App !== 'undefined') {
  App({
    globalData: {
      session: null,
    },
  });
}
