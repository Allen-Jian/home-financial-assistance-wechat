import { ApiClient, type WxRequestPort, type WxRequestOptions, type WxUploadOptions } from '../src/api/client';
import { SessionStore, type StorageLike } from '../src/auth/session-store';
import { ReadCache } from '../src/cache/read-cache';

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getStorageSync(key: string): unknown { return this.values.get(key); }
  setStorageSync(key: string, value: string): void { this.values.set(key, value); }
  removeStorageSync(key: string): void { this.values.delete(key); }
}

class FakeWx implements WxRequestPort {
  readonly requests: WxRequestOptions[] = [];
  readonly uploads: WxUploadOptions[] = [];
  constructor(private readonly responses: Array<{ statusCode: number; data: unknown }>) {}

  request(options: WxRequestOptions): void {
    this.requests.push(options);
    const response = this.responses.shift();
    if (!response) throw new Error('missing fake response');
    options.success(response);
  }

  uploadFile(options: WxUploadOptions): void {
    this.uploads.push(options);
    options.success({ statusCode: 200, data: JSON.stringify({ id: 'attachment-1' }) });
  }
}

function makeClient(fake: FakeWx, accessToken = 'access-token') {
  const sessions = new SessionStore(new MemoryStorage());
  sessions.save({ accessToken, refreshToken: 'refresh-token', householdId: 'household-1' });
  return { client: new ApiClient({ baseUrl: 'https://ledger.test/v1', sessions, transport: fake }), sessions };
}

describe('ApiClient', () => {
  test('adds the bearer token to JSON requests', async () => {
    const fake = new FakeWx([{ statusCode: 200, data: { ok: true } }]);
    const { client } = makeClient(fake);
    await expect(client.get('/reports/summary', { from: 'a', to: 'b' })).resolves.toEqual({ ok: true });
    expect(fake.requests[0].header).toEqual({ Authorization: 'Bearer access-token' });
    expect(fake.requests[0].url).toBe('https://ledger.test/v1/reports/summary?from=a&to=b');
  });

  test('requests inactive categories only when settings explicitly include them', async () => {
    const fake = new FakeWx([{ statusCode: 200, data: [] }]);
    const { client } = makeClient(fake);
    await expect(client.fetchCategories(true)).resolves.toEqual([]);
    expect(fake.requests[0].url).toBe('https://ledger.test/v1/categories?includeInactive=true');
  });

  test('refreshes once after a read 401 and replays the read', async () => {
    const fake = new FakeWx([
      { statusCode: 401, data: { message: 'expired' } },
      { statusCode: 200, data: { accessToken: 'new-access', refreshToken: 'new-refresh' } },
      { statusCode: 200, data: { netWorthMinor: 123 } },
    ]);
    const { client, sessions } = makeClient(fake);
    await expect(client.get('/reports/summary')).resolves.toEqual({ netWorthMinor: 123 });
    expect(fake.requests.map((request) => request.url)).toEqual([
      'https://ledger.test/v1/reports/summary',
      'https://ledger.test/v1/auth/refresh',
      'https://ledger.test/v1/reports/summary',
    ]);
    expect(sessions.read()).toEqual({ accessToken: 'new-access', refreshToken: 'new-refresh', householdId: 'household-1' });
  });

  test('maps JSON errors and never retries a failed financial write', async () => {
    const fake = new FakeWx([{ statusCode: 409, data: { message: 'duplicate candidates found' } }]);
    const { client } = makeClient(fake);
    await expect(client.post('/transactions', { amountMinor: 100 })).rejects.toMatchObject({
      name: 'ApiError', statusCode: 409, code: 'duplicate', message: 'duplicate candidates found',
    });
    expect(fake.requests).toHaveLength(1);
  });

  test('joins validation messages from a JSON error payload', async () => {
    const fake = new FakeWx([{ statusCode: 422, data: { message: ['amount is required', 'date is invalid'] } }]);
    const { client } = makeClient(fake);
    await expect(client.get('/reports/summary')).rejects.toMatchObject({
      statusCode: 422, code: 'validation', message: 'amount is required; date is invalid',
    });
  });

  test('passes multipart metadata to wx.uploadFile', async () => {
    const fake = new FakeWx([]);
    const { client } = makeClient(fake);
    await expect(client.upload('/attachments/draft/draft-1', {
      filePath: '/tmp/receipt.jpg', name: 'file', formData: { draftId: 'draft-1' },
    })).resolves.toEqual({ id: 'attachment-1' });
    expect(fake.uploads[0]).toMatchObject({
      url: 'https://ledger.test/v1/attachments/draft/draft-1',
      filePath: '/tmp/receipt.jpg', name: 'file', formData: { draftId: 'draft-1' },
      header: { Authorization: 'Bearer access-token' },
    });
  });

  test('falls back to a timestamped read cache only for an unavailable read', async () => {
    const fake = new FakeWx([{ statusCode: 200, data: { netWorthMinor: 42 } }]);
    const storage = new MemoryStorage();
    const sessions = new SessionStore(storage);
    sessions.save({ accessToken: 'access-token', refreshToken: 'refresh-token', householdId: 'household-1' });
    const client = new ApiClient({ baseUrl: 'https://ledger.test/v1', sessions, transport: fake, cache: new ReadCache(storage) });
    await expect(client.read('/reports/summary', {}, 'dashboard')).resolves.toMatchObject({ data: { netWorthMinor: 42 }, fromCache: false });
    await expect(client.read('/reports/summary', {}, 'dashboard')).resolves.toMatchObject({ data: { netWorthMinor: 42 }, fromCache: true, cachedAt: expect.any(Number) });
  });
});
