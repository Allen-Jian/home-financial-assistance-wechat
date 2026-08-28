import type { StorageLike } from '../auth/session-store';

export interface CachedRead<T> {
  data: T;
  cachedAt: number;
}

const CACHE_PREFIX = 'family-ledger.read.v1.';

export class ReadCache {
  constructor(
    private readonly storage: StorageLike,
    private readonly now: () => number = () => Date.now(),
  ) {}

  set<T>(key: string, data: T): void {
    this.storage.setStorageSync(`${CACHE_PREFIX}${key}`, JSON.stringify({ data, cachedAt: this.now() }));
  }

  read<T>(key: string, maxAgeMs: number): CachedRead<T> | null {
    const raw = this.storage.getStorageSync(`${CACHE_PREFIX}${key}`);
    if (typeof raw !== 'string') return null;
    try {
      const value = JSON.parse(raw) as { data?: T; cachedAt?: unknown };
      if (typeof value.cachedAt !== 'number' || value.data === undefined) return null;
      if (value.cachedAt > this.now() || this.now() - value.cachedAt > maxAgeMs) return null;
      return { data: value.data, cachedAt: value.cachedAt };
    } catch {
      return null;
    }
  }

  clear(key: string): void {
    this.storage.removeStorageSync(`${CACHE_PREFIX}${key}`);
  }
}
