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

test('keeps the conversation id for multi-turn follow-up and deletes it on the server', async () => {
  const storage = new MemoryStorage();
  const api = {
    askAi: jest.fn().mockResolvedValue({ ...answer, conversationId: 'c-1', insights: [] }),
    deleteAiConversation: jest.fn().mockResolvedValue({ deleted: true }),
  };
  const model = new AiPageModel(api, () => true, jest.fn(), storage);
  await model.send('本月花最多的分类？');
  await model.send('那上个月呢？');
  expect(api.askAi).toHaveBeenNthCalledWith(2, { conversationId: 'c-1', message: '那上个月呢？' });
  await expect(model.deleteHistory()).resolves.toBe(true);
  expect(api.deleteAiConversation).toHaveBeenCalledWith('c-1');
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

test('renders message bubbles with structured read-only assistant content', () => {
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const { join } = require('node:path') as typeof import('node:path');
  const repo = join(__dirname, '..');
  const wxml = readFileSync(join(repo, 'pages/ai/index.wxml'), 'utf8');
  const wxss = readFileSync(join(repo, 'pages/ai/index.wxss'), 'utf8');

  expect(wxml).toMatch(/class="message-row \{\{item\.role\}\}"/);
  expect(wxml).toMatch(/class="message-bubble"/);
  expect(wxml).toMatch(/class="scope-row"/);
  expect(wxml).toMatch(/class="insight-block"/);
  expect(wxml).toMatch(/class="citation-row"/);
  expect(wxml.indexOf('class="scope-row"')).toBeGreaterThan(wxml.indexOf('class="message-bubble"'));
  expect(wxml.indexOf('class="insight-block"')).toBeGreaterThan(wxml.indexOf('class="message-bubble"'));
  expect(wxml.indexOf('class="citation-row"')).toBeGreaterThan(wxml.indexOf('class="message-bubble"'));
  expect(wxss).toMatch(/\.message-row\.user\s*\{[^}]*justify-content:\s*flex-end/);
  expect(wxss).toMatch(/\.message-row\.assistant\s*\{[^}]*justify-content:\s*flex-start/);
  expect(wxss).toMatch(/\.message-bubble\s*\{[^}]*max-width:\s*78%/);
  expect(wxss).toMatch(/overflow-wrap:\s*anywhere/);
});
