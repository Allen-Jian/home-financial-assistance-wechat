import type { AiAnswer, AiCitation, AiConversationSummary, AiInsight } from '../../src/api/contracts';
import { ApiError } from '../../src/api/client';
import type { StorageLike } from '../../src/auth/session-store';
import { AI_CHAT_STORAGE_KEY, copy } from '../../src/shared/copy';
import { getRuntime } from '../../app';

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
  citations?: AiCitation[];
  insights?: AiInsight[];
}
export interface AiPageState {
  quickQuestions: readonly string[];
  messages: AiMessage[];
  loading: boolean;
  error: string;
  notice: string;
  conversationId: string;
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
    this.state = { quickQuestions: QUICK_QUESTIONS, messages: this.readHistory(), loading: false, error: '', notice: copy.aiReadOnlyNotice, conversationId: '' };
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
          citations: Array.isArray(content.citations) ? content.citations as AiCitation[] : undefined,
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
      this.state.messages.push({ role: 'assistant', content: result.answer, scope: result.scope, citations: result.citations ?? [], insights: result.insights ?? [] });
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
      return Array.isArray(value) ? value.filter(isMessage) : [];
    } catch { return []; }
  }

  private persist(): void { this.storage.setStorageSync(AI_CHAT_STORAGE_KEY, JSON.stringify(this.state.messages)); }
}

interface PageContext { setData(data: unknown): void }

interface WxNetworkRuntime {
  getNetworkType(options: { success: (result: { networkType?: string }) => void; fail?: () => void }): void;
  onNetworkStatusChange?(listener: (result: { isConnected?: boolean; networkType?: string }) => void): void;
  reLaunch(options: { url: string }): void;
}

declare const wx: WxNetworkRuntime;

function createOnlineStatus(): () => boolean {
  let online = true;
  wx.getNetworkType({ success: (result) => { online = result.networkType !== 'none'; }, fail: () => { online = false; } });
  wx.onNetworkStatusChange?.((result) => { online = result.isConnected !== false && result.networkType !== 'none'; });
  return () => online;
}

export function createAiPage(model: AiPageModel) {
  return {
    data: model.state,
    async onShow(this: PageContext) { await model.hydrate(); this.setData(model.state); },
    async send(this: PageContext, event: { detail?: { value?: string } }) { await model.send(event.detail?.value ?? ''); this.setData(model.state); },
    async quickQuestion(this: PageContext, event: { currentTarget?: { dataset?: { question?: string } } }) { await model.send(event.currentTarget?.dataset?.question ?? ''); this.setData(model.state); },
    async deleteHistory(this: PageContext) { await model.deleteHistory(); this.setData(model.state); },
  };
}

declare function Page(options: Record<string, unknown>): void;
declare function getApp<T>(): unknown;
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
  const runtime = getRuntime();
  const model = new AiPageModel(runtime.api, createOnlineStatus(), (route) => wx.reLaunch({ url: route }), runtime.storage);
  Page(createAiPage(model));
}
