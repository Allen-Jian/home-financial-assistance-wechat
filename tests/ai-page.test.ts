import { ApiError } from '../src/api/client';
import { AiPageModel, QUICK_QUESTIONS } from '../pages/ai/index';
import { SessionStore, type StorageLike } from '../src/auth/session-store';
import { clearPrivateSession } from '../app';
import { AI_CHAT_STORAGE_KEY } from '../src/shared/copy';

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();
  getStorageSync(key: string): unknown { return this.values.get(key); }
  setStorageSync(key: string, value: string): void { this.values.set(key, value); }
  removeStorageSync(key: string): void { this.values.delete(key); }
}

const answer = {
  answer: '本月餐饮支出最多。',
  scope: { from: '2026-08-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' },
  citations: [{ transactionId: 'tx-1', occurredAt: '2026-08-15T00:00:00.000Z', amountMinor: 1250, merchant: 'Market' }],
};

test('exposes the three read-only quick questions', () => {
  expect(QUICK_QUESTIONS).toEqual(['本月花最多的分类？', '找出异常支出', '比较本季与上季']);
});

test('renders an answer with scope and transaction citations', async () => {
  const api = { askAi: jest.fn().mockResolvedValue(answer) };
  const model = new AiPageModel(api, () => true, jest.fn(), new MemoryStorage());
  await expect(model.send('本月花最多的分类？')).resolves.toBe(true);
  expect(model.state.messages).toEqual(expect.arrayContaining([
    expect.objectContaining({ role: 'assistant', content: answer.answer, scope: answer.scope, citations: answer.citations }),
  ]));
  expect(model.state.notice).toContain('只能读取');
});

test('refuses to submit while offline', async () => {
  const api = { askAi: jest.fn() };
  const model = new AiPageModel(api, () => false, jest.fn(), new MemoryStorage());
  await expect(model.send('找出异常支出')).resolves.toBe(false);
  expect(api.askAi).not.toHaveBeenCalled();
  expect(model.state.error).toContain('联网');
});

test('shows timeout/error states and routes an unrecoverable 401 to login', async () => {
  const navigate = jest.fn();
  const api = { askAi: jest.fn().mockRejectedValueOnce(new ApiError(0, 'timeout', 'request timed out')).mockRejectedValueOnce(new ApiError(401, 'unauthorized', 'unauthorized')) };
  const model = new AiPageModel(api, () => true, navigate, new MemoryStorage());
  await expect(model.send('找出异常支出')).resolves.toBe(false);
  expect(model.state.error).toContain('超时');
  await expect(model.send('比较本季与上季')).resolves.toBe(false);
  expect(navigate).toHaveBeenCalledWith('/pages/login/index');
});

test('deletes private local chat history', async () => {
  const storage = new MemoryStorage();
  const api = { askAi: jest.fn().mockResolvedValue(answer) };
  const model = new AiPageModel(api, () => true, jest.fn(), storage);
  await model.send('找出异常支出');
  expect(model.state.messages.length).toBe(2);
  model.deleteHistory();
  expect(model.state.messages).toEqual([]);
});

test('clears tokens and private AI cache on logout', () => {
  const storage = new MemoryStorage();
  const sessions = new SessionStore(storage);
  sessions.save({ accessToken: 'a', refreshToken: 'r', householdId: 'h' });
  storage.setStorageSync(AI_CHAT_STORAGE_KEY, 'private');
  clearPrivateSession(sessions, storage);
  expect(sessions.read()).toBeNull();
  expect(storage.getStorageSync(AI_CHAT_STORAGE_KEY)).toBeUndefined();
});
