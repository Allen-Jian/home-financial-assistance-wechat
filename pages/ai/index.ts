import type { AiAnswer, AiCitation, AiConversationSummary, AiInsight } from '../../src/api/contracts';
import { ApiError } from '../../src/api/client';
import type { StorageLike } from '../../src/auth/session-store';
import { AI_CHAT_STORAGE_KEY, copy } from '../../src/shared/copy';
import { getRuntime } from '../../app';
import { formatNzdMinor } from '../../src/domain/money';
import { withThemePage } from '../../src/shared/themed-page';

export const QUICK_QUESTIONS = ['本月花最多的分类？', '找出异常支出', '比较本季与上季'] as const;
export interface AiApiPort {
  askAi(input: { conversationId?: string; message: string }): Promise<AiAnswer>;
  listAiConversations?: () => Promise<AiConversationSummary[]>;
  deleteAiConversation?: (id: string) => Promise<{ deleted: boolean }>;
}
export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
  scope?: { from: string; to: string };
  citations?: Array<AiCitation & { amountDisplay: string; occurredAtDisplay?: string }>;
  insights?: AiInsight[];
}
export interface AiPageState {
  quickQuestions: readonly string[];
  messages: AiMessage[];
  loading: boolean;
  error: string;
  notice: string;
  conversationId: string;
  draft: string;
  keyboardHeightPx: number;
  composerHeightPx: number;
  composerBottomPx: number;
  listBottomInsetPx: number;
  scrollTarget: string;
}

const CHAT_END_ID = 'chat-end';
const COMPOSER_GAP_PX = 8;
const LIST_GAP_PX = 12;
const CUSTOM_TAB_HEIGHT_PX = 64;

function nonNegativeFinite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

export function calculateChatInsets(keyboard: number, composer: number, safe: number): { composerBottomPx: number; listBottomInsetPx: number } {
  const keyboardHeightPx = nonNegativeFinite(keyboard);
  const composerHeightPx = nonNegativeFinite(composer);
  const safeAreaBottomPx = nonNegativeFinite(safe);
  const composerBottomPx = keyboardHeightPx > 0
    ? keyboardHeightPx + COMPOSER_GAP_PX
    : CUSTOM_TAB_HEIGHT_PX + safeAreaBottomPx + COMPOSER_GAP_PX;
  return { composerBottomPx, listBottomInsetPx: composerBottomPx + composerHeightPx + LIST_GAP_PX };
}

function citationDisplay(citation: AiCitation): AiCitation & { amountDisplay: string; occurredAtDisplay?: string } {
  const occurredAt = typeof citation.occurredAt === 'string' ? citation.occurredAt : '';
  const date = occurredAt ? new Date(occurredAt) : null;
  const occurredAtDisplay = date && !Number.isNaN(date.valueOf())
    ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Pacific/Auckland', month: 'numeric', day: 'numeric' }).format(date)
    : occurredAt || undefined;
  return {
    ...citation,
    amountDisplay: formatNzdMinor(citation.amountMinor),
    ...(occurredAtDisplay ? { occurredAtDisplay } : {}),
  };
}

function isMessage(value: unknown): value is AiMessage {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string';
}

export class AiPageModel {
  readonly state: AiPageState;

  constructor(
    private readonly api: AiApiPort,
    private readonly isOnline: () => boolean,
    private readonly navigate: (route: string) => void,
    private readonly storage: StorageLike,
  ) {
    const composerHeightPx = 60;
    const insets = calculateChatInsets(0, composerHeightPx, 0);
    this.state = {
      quickQuestions: QUICK_QUESTIONS,
      messages: this.readHistory(),
      loading: false,
      error: '',
      notice: copy.aiReadOnlyNotice,
      conversationId: '',
      draft: '',
      keyboardHeightPx: 0,
      composerHeightPx,
      ...insets,
      scrollTarget: '',
    };
  }

  async hydrate(): Promise<void> {
    if (!this.isOnline() || !this.api.listAiConversations) return;
    try {
      const conversations = await this.api.listAiConversations();
      const latest = conversations[0] as (AiConversationSummary & { messages?: Array<{ role: 'user' | 'assistant'; contentJson?: unknown }> }) | undefined;
      if (!latest) return;
      this.state.conversationId = latest.id;
      if (Array.isArray(latest.messages)) this.state.messages = latest.messages.map((message) => {
        const content = typeof message.contentJson === 'object' && message.contentJson !== null ? message.contentJson as Record<string, unknown> : {};
        return {
          role: message.role,
          content: typeof content.answer === 'string' ? content.answer : typeof content.text === 'string' ? content.text : '',
          scope: content.scope as { from: string; to: string } | undefined,
          citations: Array.isArray(content.citations) ? (content.citations as AiCitation[]).map(citationDisplay) : undefined,
          insights: Array.isArray(content.insights) ? content.insights as AiInsight[] : undefined,
        };
      }).filter((message) => message.content);
      this.persist();
    } catch { /* cached chat remains visible */ }
  }

  async send(message: string): Promise<boolean> {
    const value = message.trim();
    if (!value) return false;
    if (!this.isOnline()) { this.state.error = copy.networkRequired; return false; }
    this.state.loading = true;
    this.state.error = '';
    this.state.messages.push({ role: 'user', content: value });
    this.persist();
    try {
      const result = await this.api.askAi({ conversationId: this.state.conversationId || undefined, message: value });
      this.state.conversationId = result.conversationId || this.state.conversationId;
      this.state.messages.push({ role: 'assistant', content: result.answer, scope: result.scope, citations: (result.citations ?? []).map(citationDisplay), insights: result.insights ?? [] });
      this.persist();
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 401) {
        this.navigate('/pages/login/index');
        this.state.error = copy.loginExpired;
      } else if (error instanceof ApiError && error.statusCode === 409) {
        this.state.error = copy.duplicateConflict;
      } else if (error instanceof ApiError && error.code === 'timeout') {
        this.state.error = copy.requestTimeout;
      } else {
        this.state.error = error instanceof Error ? error.message : copy.aiFailed;
      }
      return false;
    } finally { this.state.loading = false; }
  }

  setDraft(value: string): void { this.state.draft = value; }

  async sendCurrent(): Promise<boolean> {
    const sent = await this.send(this.state.draft);
    if (sent) this.state.draft = '';
    return sent;
  }

  deleteHistory(): Promise<boolean> {
    const conversationId = this.state.conversationId;
    this.state.messages = [];
    this.state.conversationId = '';
    this.storage.removeStorageSync(AI_CHAT_STORAGE_KEY);
    if (!conversationId || !this.api.deleteAiConversation) return Promise.resolve(true);
    return this.api.deleteAiConversation(conversationId).then((result) => result.deleted).catch(() => false);
  }

  private readHistory(): AiMessage[] {
    const raw = this.storage.getStorageSync(AI_CHAT_STORAGE_KEY);
    if (typeof raw !== 'string') return [];
    try {
      const value = JSON.parse(raw) as unknown;
      return Array.isArray(value) ? value.filter(isMessage).map((message) => ({
        ...message,
        citations: message.citations?.map((citation) => ({ ...citation, amountDisplay: citation.amountDisplay ?? formatNzdMinor(citation.amountMinor) })),
      })) : [];
    } catch { return []; }
  }

  private persist(): void { this.storage.setStorageSync(AI_CHAT_STORAGE_KEY, JSON.stringify(this.state.messages)); }
}

interface PageContext {
  setData(data: unknown): void;
  getTabBar?(): { setData(data: { selected: number }): void } | undefined;
  createSelectorQuery?(): {
    select(selector: string): {
      boundingClientRect(callback: (rect: { height?: number } | Array<{ height?: number }> | null) => void): unknown;
    };
    exec(callback: (rects: Array<{ height?: number }>) => void): void;
  };
  __keyboardListener?: (result: { height?: number }) => void;
  __safeAreaBottomPx?: number;
}

interface WxNetworkRuntime {
  getNetworkType(options: { success: (result: { networkType?: string }) => void; fail?: () => void }): void;
  onNetworkStatusChange?(listener: (result: { isConnected?: boolean; networkType?: string }) => void): void;
  reLaunch(options: { url: string }): void;
  onKeyboardHeightChange?(listener: (result: { height?: number }) => void): void;
  offKeyboardHeightChange?(listener: (result: { height?: number }) => void): void;
  nextTick?(callback: () => void): void;
  getSystemInfoSync?(): {
    screenHeight?: number;
    safeArea?: { bottom?: number };
    safeAreaInsets?: { bottom?: number };
  };
}

declare const wx: WxNetworkRuntime;

function createOnlineStatus(): () => boolean {
  let online = true;
  wx.getNetworkType({ success: (result) => { online = result.networkType !== 'none'; }, fail: () => { online = false; } });
  wx.onNetworkStatusChange?.((result) => { online = result.isConnected !== false && result.networkType !== 'none'; });
  return () => online;
}

function wxRuntime(): WxNetworkRuntime | undefined {
  return typeof wx === 'undefined' ? undefined : wx;
}

function safeAreaBottomPx(): number {
  const info = wxRuntime()?.getSystemInfoSync?.();
  const inset = info?.safeAreaInsets?.bottom;
  if (typeof inset === 'number' && Number.isFinite(inset)) return nonNegativeFinite(inset);
  const safeBottom = info?.safeArea?.bottom;
  if (typeof safeBottom !== 'number' || !Number.isFinite(safeBottom)) return 0;
  if (typeof info?.screenHeight === 'number' && Number.isFinite(info.screenHeight)) {
    return nonNegativeFinite(info.screenHeight - safeBottom);
  }
  return nonNegativeFinite(safeBottom);
}

function pageSafeArea(page: PageContext): void {
  page.__safeAreaBottomPx ??= safeAreaBottomPx();
}

function applyChatInsets(model: AiPageModel, page: PageContext, keyboardHeightPx = model.state.keyboardHeightPx): void {
  const insets = calculateChatInsets(keyboardHeightPx, model.state.composerHeightPx, page.__safeAreaBottomPx ?? 0);
  model.state.keyboardHeightPx = nonNegativeFinite(keyboardHeightPx);
  model.state.composerBottomPx = insets.composerBottomPx;
  model.state.listBottomInsetPx = insets.listBottomInsetPx;
  page.setData({ keyboardHeightPx: model.state.keyboardHeightPx, composerBottomPx: insets.composerBottomPx, listBottomInsetPx: insets.listBottomInsetPx });
}

function updateComposerHeight(model: AiPageModel, page: PageContext, height: number): void {
  if (!Number.isFinite(height)) return;
  model.state.composerHeightPx = nonNegativeFinite(height, model.state.composerHeightPx);
  applyChatInsets(model, page);
  scrollToChatEnd(model, page);
}

function scrollToChatEnd(model: AiPageModel, page: PageContext): void {
  model.state.scrollTarget = '';
  page.setData({ scrollTarget: '' });
  const commit = () => {
    model.state.scrollTarget = CHAT_END_ID;
    page.setData({ scrollTarget: CHAT_END_ID });
  };
  const runtime = wxRuntime();
  if (runtime?.nextTick) runtime.nextTick(commit);
  else commit();
}

function measureComposer(model: AiPageModel, page: PageContext): void {
  const query = page.createSelectorQuery?.();
  if (!query) return;
  const target = query.select('.composer');
  let measured = false;
  const applyMeasurement = (result: { height?: number } | Array<{ height?: number }> | null): void => {
    const rect = Array.isArray(result) ? result[0] : result;
    if (!rect || typeof rect.height !== 'number' || !Number.isFinite(rect.height)) return;
    measured = true;
    updateComposerHeight(model, page, rect.height);
  };
  target.boundingClientRect(applyMeasurement);
  query.exec((rects) => { if (!measured) applyMeasurement(rects); });
}

function registerKeyboardListener(model: AiPageModel, page: PageContext): void {
  const runtime = wxRuntime();
  if (!runtime?.onKeyboardHeightChange || page.__keyboardListener) return;
  page.__safeAreaBottomPx ??= safeAreaBottomPx();
  const listener = (result: { height?: number }) => {
    const keyboardHeightPx = typeof result?.height === 'number' && Number.isFinite(result.height) ? result.height : 0;
    applyChatInsets(model, page, keyboardHeightPx);
    measureComposer(model, page);
    scrollToChatEnd(model, page);
  };
  page.__keyboardListener = listener;
  runtime.onKeyboardHeightChange(listener);
}

function resetKeyboardListener(model: AiPageModel, page: PageContext): void {
  const runtime = wxRuntime();
  const listener = page.__keyboardListener;
  if (listener) runtime?.offKeyboardHeightChange?.(listener);
  page.__keyboardListener = undefined;
  applyChatInsets(model, page, 0);
}

async function refreshAfterOperation(model: AiPageModel, page: PageContext, operation: () => Promise<unknown>): Promise<void> {
  const pending = operation();
  page.setData(model.state);
  scrollToChatEnd(model, page);
  await pending;
  page.setData(model.state);
  measureComposer(model, page);
  scrollToChatEnd(model, page);
}

export function createAiPage(model: AiPageModel) {
  return {
    data: model.state,
    async onShow(this: PageContext) {
      pageSafeArea(this);
      registerKeyboardListener(model, this);
      this.getTabBar?.()?.setData({ selected: 3 });
      await model.hydrate();
      this.setData(model.state);
      measureComposer(model, this);
      scrollToChatEnd(model, this);
    },
    async send(this: PageContext, event: { detail?: { value?: string } }) { await refreshAfterOperation(model, this, () => model.send(event.detail?.value ?? '')); },
    onInput(this: PageContext, event: { detail?: { value?: string } }) { model.setDraft(event.detail?.value ?? ''); this.setData(model.state); measureComposer(model, this); scrollToChatEnd(model, this); },
    onComposerLineChange(this: PageContext, event?: { detail?: { height?: number } }) {
      if (this.createSelectorQuery) measureComposer(model, this);
      else if (typeof event?.detail?.height === 'number') updateComposerHeight(model, this, event.detail.height);
    },
    onComposerResize(this: PageContext, event?: { detail?: { height?: number } }) {
      if (this.createSelectorQuery) measureComposer(model, this);
      else if (typeof event?.detail?.height === 'number') updateComposerHeight(model, this, event.detail.height);
    },
    async sendCurrent(this: PageContext) { await refreshAfterOperation(model, this, () => model.sendCurrent()); },
    async quickQuestion(this: PageContext, event: { currentTarget?: { dataset?: { question?: string } } }) { await refreshAfterOperation(model, this, () => model.send(event.currentTarget?.dataset?.question ?? '')); },
    async deleteHistory(this: PageContext) { await model.deleteHistory(); this.setData(model.state); scrollToChatEnd(model, this); },
    onHide(this: PageContext) { resetKeyboardListener(model, this); },
    onUnload(this: PageContext) { resetKeyboardListener(model, this); },
  };
}

declare function Page(options: Record<string, unknown>): void;
declare function getApp<T>(): unknown;
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
  const runtime = getRuntime();
  const model = new AiPageModel(runtime.api, createOnlineStatus(), (route) => wx.reLaunch({ url: route }), runtime.storage);
  Page(withThemePage(createAiPage(model), runtime.theme));
}
