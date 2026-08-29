import { ApiClient, type WxRequestPort } from '../src/api/client';
import { SessionStore, type StorageLike } from '../src/auth/session-store';

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();
  getStorageSync(key: string): unknown { return this.values.get(key); }
  setStorageSync(key: string, value: string): void { this.values.set(key, value); }
  removeStorageSync(key: string): void { this.values.delete(key); }
}

class Transport implements WxRequestPort {
  readonly requests: Array<{ method: string; url: string; data?: unknown }> = [];
  constructor(private readonly response: unknown) {}
  request(options: any): void { this.requests.push({ method: options.method, url: options.url, data: options.data }); options.success({ statusCode: 200, data: this.response }); }
  uploadFile(): void { throw new Error('not used'); }
}

test('sends conversation id and exposes insights and citations', async () => {
  const transport = new Transport({ conversationId: 'c-1', answer: '好', scope: { from: '2026-08-01', to: '2026-08-31' }, insights: [], citations: [] });
  const sessions = new SessionStore(new MemoryStorage());
  sessions.save({ accessToken: 'a', refreshToken: 'r', householdId: 'h' });
  const client = new ApiClient({ baseUrl: 'https://ledger.test/v1', sessions, transport });
  await expect(client.askAi({ conversationId: 'c-1', message: '那上个月呢？' })).resolves.toMatchObject({ conversationId: 'c-1', answer: '好', citations: [] });
  expect(transport.requests[0]).toMatchObject({ method: 'POST', url: 'https://ledger.test/v1/ai/chat', data: { conversationId: 'c-1', message: '那上个月呢？' } });
});

test('maps conversation deletion and draft parse to their API routes', async () => {
  const transport = new Transport({ deleted: true });
  const sessions = new SessionStore(new MemoryStorage());
  sessions.save({ accessToken: 'a', refreshToken: 'r', householdId: 'h' });
  const client = new ApiClient({ baseUrl: 'https://ledger.test/v1', sessions, transport });
  await expect(client.deleteAiConversation('c-1')).resolves.toEqual({ deleted: true });
  await expect(client.parseDraft('昨天超市花了18.90')).resolves.toEqual({ deleted: true });
  expect(transport.requests.map((request) => `${request.method} ${request.url}`)).toEqual(['DELETE https://ledger.test/v1/ai/conversations/c-1', 'POST https://ledger.test/v1/ai/parse-draft']);
});
