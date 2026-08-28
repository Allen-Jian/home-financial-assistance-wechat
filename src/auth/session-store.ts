import type { TokenPair } from '../api/contracts';

export const SESSION_STORAGE_KEY = 'family-ledger.session.v1';

export interface StorageLike {
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: string): void;
  removeStorageSync(key: string): void;
}

export interface Session extends TokenPair {}

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.accessToken === 'string'
    && typeof candidate.refreshToken === 'string'
    && typeof candidate.householdId === 'string'
    && candidate.accessToken.length > 0
    && candidate.refreshToken.length > 0
    && candidate.householdId.length > 0;
}

export class SessionStore {
  constructor(private readonly storage: StorageLike) {}

  save(session: Session): void {
    this.storage.setStorageSync(SESSION_STORAGE_KEY, JSON.stringify(session));
  }

  read(): Session | null {
    const raw = this.storage.getStorageSync(SESSION_STORAGE_KEY);
    if (typeof raw !== 'string') return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return isSession(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  clear(): void {
    this.storage.removeStorageSync(SESSION_STORAGE_KEY);
  }
}
