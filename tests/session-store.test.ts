import { SessionStore, type StorageLike } from '../src/auth/session-store';

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();

  getStorageSync(key: string): string | undefined {
    return this.values.get(key);
  }

  setStorageSync(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeStorageSync(key: string): void {
    this.values.delete(key);
  }
}

test('stores and clears tokens without exposing the refresh token in logs', () => {
  const storage = new MemoryStorage();
  const sessions = new SessionStore(storage);
  sessions.save({ accessToken: 'a', refreshToken: 'r', householdId: 'h' });
  expect(sessions.read()).toEqual({ accessToken: 'a', refreshToken: 'r', householdId: 'h' });
  sessions.clear();
  expect(sessions.read()).toBeNull();
});

test('treats malformed stored sessions as logged out', () => {
  const storage = new MemoryStorage();
  storage.setStorageSync('family-ledger.session.v1', '{bad');
  expect(new SessionStore(storage).read()).toBeNull();
});
