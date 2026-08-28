import type { AiAnswer, AiCitation } from '../../src/api/contracts';
import { ApiError } from '../../src/api/client';
import type { StorageLike } from '../../src/auth/session-store';
import { AI_CHAT_STORAGE_KEY, copy } from '../../src/shared/copy';

export const QUICK_QUESTIONS = ['本月花最多的分类？', '找出异常支出', '比较本季与上季'] as const;
export interface AiApiPort { askAi(message: string): Promise<Partial<AiAnswer> & { answer: string }> }
export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
  scope?: { from: string; to: string };
  citations?: AiCitation[];
}
export interface AiPageState {
  quickQuestions: readonly string[];
  messages: AiMessage[];
  loading: boolean;
  error: string;
  notice: string;
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
    this.state = { quickQuestions: QUICK_QUESTIONS, messages: this.readHistory(), loading: false, error: '', notice: copy.aiReadOnlyNotice };
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
      const result = await this.api.askAi(value);
      this.state.messages.push({ role: 'assistant', content: result.answer, scope: result.scope, citations: result.citations ?? [] });
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

  deleteHistory(): void {
    this.state.messages = [];
    this.storage.removeStorageSync(AI_CHAT_STORAGE_KEY);
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

declare function Page(options: Record<string, unknown>): void;
if (typeof Page !== 'undefined') Page({ data: { quickQuestions: QUICK_QUESTIONS, messages: [], loading: false, error: '', notice: copy.aiReadOnlyNotice } });
