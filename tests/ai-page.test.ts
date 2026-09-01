import { ApiError } from '../src/api/client';
import { AiPageModel, createAiPage, QUICK_QUESTIONS } from '../pages/ai/index';
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
    expect.objectContaining({ role: 'assistant', content: answer.answer, scope: answer.scope, citations: [expect.objectContaining({ transactionId: 'tx-1', amountDisplay: 'NZ$12.50' })] }),
  ]));
  expect(model.state.notice).toContain('只能读取');
});

test('formats available citation dates without inventing missing dates', async () => {
  const withoutDate = { transactionId: 'tx-2', amountMinor: 200 } as unknown as typeof answer.citations[number];
  const api = { askAi: jest.fn().mockResolvedValue({
    ...answer,
    citations: [answer.citations[0], withoutDate],
    insights: [],
  }) };
  const model = new AiPageModel(api, () => true, jest.fn(), new MemoryStorage());

  await expect(model.send('找出异常支出')).resolves.toBe(true);

  const citations = model.state.messages[1].citations ?? [];
  expect(citations[0]).toMatchObject({ occurredAtDisplay: '8/15' });
  expect(citations[1]).not.toHaveProperty('occurredAtDisplay');
});

test('composer sends the currently typed question and clears it after success', async () => {
  const api = { askAi: jest.fn().mockResolvedValue({ ...answer, citations: [], conversationId: 'c-1', insights: [] }) };
  const model = new AiPageModel(api, () => true, jest.fn(), new MemoryStorage());
  const page = createAiPage(model);
  const context = { setData: jest.fn() };
  page.onInput.call(context, { detail: { value: '本月有什么异常？' } });

  await page.sendCurrent.call(context);

  expect(api.askAi).toHaveBeenCalledWith({ conversationId: undefined, message: '本月有什么异常？' });
  expect(model.state.draft).toBe('');
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

  const withoutComments = wxml.replace(/<!--[\s\S]*?-->/g, '');
  const bubbleStart = withoutComments.indexOf('<view class="message-bubble">');
  expect(bubbleStart).toBeGreaterThanOrEqual(0);
  const viewTags = /<\/?view\b[^>]*>/g;
  viewTags.lastIndex = bubbleStart;
  let depth = 0;
  let bubbleEnd = -1;
  let match: RegExpExecArray | null;
  while ((match = viewTags.exec(withoutComments))) {
    if (match[0].startsWith('</')) depth -= 1;
    else if (!match[0].endsWith('/>')) depth += 1;
    if (depth === 0) { bubbleEnd = viewTags.lastIndex; break; }
  }
  expect(bubbleEnd).toBeGreaterThan(bubbleStart);
  const bubble = withoutComments.slice(bubbleStart, bubbleEnd);

  expect(withoutComments).toMatch(/class="message-row \{\{item\.role\}\}"/);
  expect(bubble).toMatch(/class="scope-row"/);
  expect(bubble).toMatch(/class="insight-block"/);
  expect(bubble).toMatch(/class="citation-row"[\s\S]*?class="citation-date"[\s\S]*?citation\.occurredAtDisplay/);
  expect(withoutComments).not.toMatch(/class="message \{\{item\.role\}\}"/);
  expect(withoutComments).not.toMatch(/class="scope-line"|class="insight-line"/);
  expect(wxss).toMatch(/\.message-row\.user\s*\{[^}]*justify-content:\s*flex-end/);
  expect(wxss).toMatch(/\.message-row\.assistant\s*\{[^}]*justify-content:\s*flex-start/);
  expect(wxss).toMatch(/\.message-bubble\s*\{[^}]*max-width:\s*78%/);
  expect(wxss).toMatch(/\.message-bubble\s*\{[^}]*width:\s*(?:fit-content|max-content|auto)/);
  expect(wxss).not.toMatch(/\.message-bubble\s*\{[^}]*;\s*width:\s*(?:78%|100%)/);
  expect(wxss).toMatch(/overflow-wrap:\s*anywhere/);
});
