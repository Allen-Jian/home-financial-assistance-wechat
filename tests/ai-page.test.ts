import { ApiError } from '../src/api/client';
import { AiPageModel, calculateChatInsets, createAiPage, QUICK_QUESTIONS } from '../pages/ai/index';
import type { AiConversationSummary } from '../src/api/contracts';
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

test('calculates composer and list insets above the keyboard or custom tab bar', () => {
  expect(calculateChatInsets(280, 96, 24, 320)).toEqual({ composerBottomPx: 288, listBottomInsetPx: 396 });
  expect(calculateChatInsets(0, 96, 24, 320)).toEqual({ composerBottomPx: 79.78666666666666, listBottomInsetPx: 187.78666666666666 });
  expect(calculateChatInsets(0, 96, 24, 375).composerBottomPx).toBeCloseTo(88, 8);
  expect(calculateChatInsets(0, 96, 24, 428).composerBottomPx).toBeCloseTo(95.91466666666667, 8);
});

test('registers one keyboard listener and resets it on hide and unload', async () => {
  const listeners: Array<(result: { height?: number }) => void> = [];
  const offKeyboardHeightChange = jest.fn();
  const previousWx = (globalThis as { wx?: unknown }).wx;
  (globalThis as { wx?: unknown }).wx = {
    onKeyboardHeightChange: jest.fn((listener: (result: { height?: number }) => void) => listeners.push(listener)),
    offKeyboardHeightChange,
    nextTick: (callback: () => void) => callback(),
    getSystemInfoSync: () => ({ safeArea: { bottom: 24 } }),
  };
  try {
    const model = new AiPageModel({ askAi: jest.fn() }, () => true, jest.fn(), new MemoryStorage());
    const page = createAiPage(model);
    const context = { setData: jest.fn(), getTabBar: jest.fn() };

    await page.onShow.call(context);
    await page.onShow.call(context);
    expect(listeners).toHaveLength(1);

    listeners[0]({ height: 280 });
    expect(model.state.keyboardHeightPx).toBe(280);
    expect(model.state.composerBottomPx).toBe(288);
    listeners[0]({ height: 0 });
    expect(model.state.keyboardHeightPx).toBe(0);
    expect(model.state.composerBottomPx).toBe(88);

    page.onHide.call(context);
    expect(offKeyboardHeightChange).toHaveBeenCalledTimes(1);
    expect(model.state.keyboardHeightPx).toBe(0);
    page.onUnload.call(context);
    expect(offKeyboardHeightChange).toHaveBeenCalledTimes(1);
  } finally {
    (globalThis as { wx?: unknown }).wx = previousWx;
  }
});

test('measures composer changes and scrolls to the stable chat end anchor', async () => {
  const previousWx = (globalThis as { wx?: unknown }).wx;
  (globalThis as { wx?: unknown }).wx = { nextTick: (callback: () => void) => callback(), getSystemInfoSync: () => ({ safeArea: { bottom: 0 } }) };
  try {
    const model = new AiPageModel({ askAi: jest.fn().mockResolvedValue(answer) }, () => true, jest.fn(), new MemoryStorage());
    const page = createAiPage(model);
    const setData = jest.fn();
    const query = {
      select: jest.fn().mockReturnThis(),
      boundingClientRect: jest.fn().mockReturnThis(),
      exec: jest.fn((callback: (rects: Array<{ height: number }>) => void) => callback([{ height: 144 }])),
    };
    const context = { setData, createSelectorQuery: jest.fn(() => query), getTabBar: jest.fn() };

    await page.onShow.call(context);
    page.onComposerLineChange.call(context, { detail: { height: 200 } });
    expect(model.state.composerHeightPx).toBe(144);
    expect(model.state.listBottomInsetPx).toBe(220);
    expect(setData).toHaveBeenCalledWith(expect.objectContaining({ scrollTarget: '' }));
    expect(setData).toHaveBeenCalledWith(expect.objectContaining({ scrollTarget: 'chat-end' }));

    await page.sendCurrent.call(context);
    expect(setData).toHaveBeenCalledWith(expect.objectContaining({ scrollTarget: 'chat-end' }));
  } finally {
    (globalThis as { wx?: unknown }).wx = previousWx;
  }
});

test('applies safe-area metrics before unresolved history hydration and scrolls cached history first', async () => {
  const storage = new MemoryStorage();
  storage.setStorageSync(AI_CHAT_STORAGE_KEY, JSON.stringify([{ role: 'user', content: '缓存问题' }]));
  let resolveHistory!: (value: AiConversationSummary[]) => void;
  const api = {
    askAi: jest.fn(),
    listAiConversations: jest.fn(() => new Promise<AiConversationSummary[]>((resolve) => { resolveHistory = resolve; })),
  };
  const nextTicks: Array<() => void> = [];
  const previousWx = (globalThis as { wx?: unknown }).wx;
  (globalThis as { wx?: unknown }).wx = {
    nextTick: (callback: () => void) => nextTicks.push(callback),
    getSystemInfoSync: () => ({ screenHeight: 800, windowWidth: 320, safeArea: { bottom: 760 } }),
  };
  try {
    const model = new AiPageModel(api, () => true, jest.fn(), storage);
    const page = createAiPage(model);
    const setData = jest.fn();
    const context = { setData, getTabBar: jest.fn() };
    const pending = page.onShow.call(context);
    await Promise.resolve();

    expect(setData).toHaveBeenNthCalledWith(1, expect.objectContaining({ composerBottomPx: expect.closeTo(47.7866666667 + 40 + 8, 8) }));
    expect(setData).toHaveBeenCalledWith(expect.objectContaining({ scrollTarget: '' }));
    expect(nextTicks).toHaveLength(1);
    nextTicks.shift()?.();
    expect(setData).toHaveBeenCalledWith(expect.objectContaining({ scrollTarget: 'chat-end' }));

    resolveHistory([]);
    await pending;
  } finally {
    (globalThis as { wx?: unknown }).wx = previousWx;
  }
});

test('ignores queued nextTick and selector callbacks after hide or unload', async () => {
  const nextTicks: Array<() => void> = [];
  let selectorCallback: ((rects: Array<{ height?: number }>) => void) | undefined;
  const previousWx = (globalThis as { wx?: unknown }).wx;
  (globalThis as { wx?: unknown }).wx = {
    nextTick: (callback: () => void) => nextTicks.push(callback),
    getSystemInfoSync: () => ({ screenHeight: 800, windowWidth: 375, safeArea: { bottom: 760 } }),
  };
  try {
    const model = new AiPageModel({ askAi: jest.fn() }, () => true, jest.fn(), new MemoryStorage());
    const page = createAiPage(model);
    const setData = jest.fn();
    const query = {
      select: jest.fn().mockReturnThis(),
      boundingClientRect: jest.fn().mockReturnThis(),
      exec: jest.fn((callback: (rects: Array<{ height?: number }>) => void) => { selectorCallback = callback; }),
    };
    const context = { setData, createSelectorQuery: jest.fn(() => query), getTabBar: jest.fn() };

    await page.onShow.call(context);
    page.onHide.call(context);
    const callsAfterHide = setData.mock.calls.length;
    nextTicks.splice(0).forEach((callback) => callback());
    selectorCallback?.([{ height: 180 }]);
    expect(setData).toHaveBeenCalledTimes(callsAfterHide);

    await page.onShow.call(context);
    page.onUnload.call(context);
    const callsAfterUnload = setData.mock.calls.length;
    nextTicks.splice(0).forEach((callback) => callback());
    selectorCallback?.([{ height: 200 }]);
    expect(setData).toHaveBeenCalledTimes(callsAfterUnload);
  } finally {
    (globalThis as { wx?: unknown }).wx = previousWx;
  }
});

test('bounds the AI viewport and uses one dynamic list inset source', () => {
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const { join } = require('node:path') as typeof import('node:path');
  const repo = join(__dirname, '..');
  const wxml = readFileSync(join(repo, 'pages/ai/index.wxml'), 'utf8');
  const wxss = readFileSync(join(repo, 'pages/ai/index.wxss'), 'utf8');

  expect(wxml).toMatch(/<textarea[^>]*auto-height[^>]*adjust-position="\{\{false\}\}"/);
  expect(wxml).toMatch(/scroll-into-view="\{\{scrollTarget\}\}"/);
  expect(wxml).toMatch(/id="chat-end"/);
  expect(wxss).toMatch(/\.ai-page\s*\{[^}]*height:\s*100vh[^}]*min-height:\s*0[^}]*overflow:\s*hidden/s);
  expect(wxss).toMatch(/\.chat-list\s*\{[^}]*flex:\s*1[^}]*min-height:\s*0/s);
  expect(wxss).not.toMatch(/\.ai-page\s*\{[^}]*padding-bottom:\s*calc\(/s);
  expect(wxss).not.toMatch(/\.chat-list\s*\{[^}]*height:\s*calc\(100vh/s);
});

test('renders the submitted user message, assistant response, and error transition', async () => {
  const api = {
    askAi: jest.fn()
      .mockResolvedValueOnce({ ...answer, citations: [], insights: [] })
      .mockRejectedValueOnce(new ApiError(0, 'timeout', 'request timed out')),
  };
  const model = new AiPageModel(api, () => true, jest.fn(), new MemoryStorage());
  const page = createAiPage(model);
  const context = { setData: jest.fn(), getTabBar: jest.fn() };

  await page.send.call(context, { detail: { value: '本月花最多的分类？' } });
  expect(model.state.messages).toEqual([
    expect.objectContaining({ role: 'user', content: '本月花最多的分类？' }),
    expect.objectContaining({ role: 'assistant', content: answer.answer }),
  ]);
  await page.send.call(context, { detail: { value: '再比较上个月' } });
  expect(model.state.messages).toEqual(expect.arrayContaining([
    expect.objectContaining({ role: 'user', content: '再比较上个月' }),
  ]));
  expect(model.state.error).toContain('超时');
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

test('separates citation merchant, amount, and date into readable metadata', () => {
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const { join } = require('node:path') as typeof import('node:path');
  const repo = join(__dirname, '..');
  const wxml = readFileSync(join(repo, 'pages/ai/index.wxml'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const wxss = readFileSync(join(repo, 'pages/ai/index.wxss'), 'utf8');
  const textElements = [...wxml.matchAll(/<text\b[^>]*>[\s\S]*?<\/text>/g)].map((match) => match[0]);
  const amountElement = textElements.find((element) => element.includes('citation.amountDisplay')) ?? '';
  const dateElement = textElements.find((element) => element.includes('citation.occurredAtDisplay')) ?? '';

  expect(wxml).toMatch(/class="citation-meta"/);
  expect(wxml).toMatch(/class="citation-amount"[^>]*>\{\{citation\.amountDisplay\}\}/);
  expect(wxml).toMatch(/class="citation-date-separator"[^>]*wx:if="\{\{citation\.occurredAt\}\}"/);
  expect(wxml).toMatch(/class="citation-date"[^>]*>\{\{citation\.occurredAtDisplay \|\| citation\.occurredAt\}\}/);
  expect(amountElement).not.toContain('citation.occurredAt');
  expect(dateElement).not.toContain('citation.amountDisplay');
  expect(wxss).toMatch(/\.citation-copy\s*\{/);
  expect(wxss).toMatch(/\.citation-meta\s*\{[^}]*display:\s*flex[^}]*gap:\s*\d+rpx/);
  expect(wxss).toMatch(/\.citation-date-separator\s*\{/);
  expect(wxss).toMatch(/\.citation-date\s*\{/);
});

interface CssRule {
  selectors: string[];
  declarations: Record<string, string>;
}

function parseCssRules(styles: string): CssRule[] {
  const rules: CssRule[] = [];
  const source = styles.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations: Record<string, string> = {};
    for (const declaration of match[2].split(';')) {
      const separator = declaration.indexOf(':');
      if (separator < 0) continue;
      const property = declaration.slice(0, separator).trim();
      const value = declaration.slice(separator + 1).trim();
      if (property && value) declarations[property] = value;
    }
    rules.push({ selectors: match[1].split(',').map((selector) => selector.trim()), declarations });
  }
  return rules;
}

function assertMessageBubbleCascade(styles: string): void {
  const rules = parseCssRules(styles);
  const exactRules = rules.filter((rule) => rule.selectors.includes('.message-bubble'));
  const finalDeclarations = exactRules.reduce<Record<string, string>>((result, rule) => ({ ...result, ...rule.declarations }), {});
  const equivalentOverrides = rules
    .filter((rule) => rule.selectors.some((selector) => selector.includes('.message-bubble') && selector !== '.message-bubble'))
    .flatMap((rule) => Object.keys(rule.declarations).filter((property) => property === 'width' || property === 'max-width'));
  if (equivalentOverrides.length || finalDeclarations.width !== 'fit-content' || finalDeclarations['max-width'] !== '78%') {
    throw new Error(`unexpected message bubble cascade: ${JSON.stringify({ finalDeclarations, equivalentOverrides })}`);
  }
}

test('asserts final message-bubble width cascade and rejects later overrides', () => {
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const { join } = require('node:path') as typeof import('node:path');
  const wxss = readFileSync(join(__dirname, '..', 'pages/ai/index.wxss'), 'utf8');

  expect(() => assertMessageBubbleCascade(wxss)).not.toThrow();
  expect(() => assertMessageBubbleCascade(`${wxss}\n.message-bubble { width: 100%; max-width: 100%; }`)).toThrow();
  expect(() => assertMessageBubbleCascade(`${wxss}\n.message-row.user .message-bubble { width: 100%; }`)).toThrow();
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
