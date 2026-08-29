import type {
  AiAnswer,
  AiConversationSummary,
  DashboardSummary,
  DocumentDraft,
  HouseholdInvite,
  HouseholdMember,
  ImportedRow,
  ReportSummary,
  RecurringSummary,
  StageResult,
  TokenPair,
  TransactionSummary,
  AiInsight,
  WechatLoginResponse,
} from './contracts';
import { SessionStore } from '../auth/session-store';
import { ReadCache, type CachedRead } from '../cache/read-cache';
import { isRecord } from '../shared/guards';

export type RequestMethod = 'GET' | 'POST' | 'DELETE';
export interface WxResponse {
  statusCode: number;
  data: unknown;
}

export interface WxRequestOptions {
  url: string;
  method: RequestMethod;
  data?: unknown;
  header?: Record<string, string>;
  timeout?: number;
  success: (response: WxResponse) => void;
  fail: (error: unknown) => void;
}

export interface WxUploadOptions {
  url: string;
  filePath: string;
  name: string;
  formData?: Record<string, string>;
  header?: Record<string, string>;
  timeout?: number;
  success: (response: WxResponse) => void;
  fail: (error: unknown) => void;
}

export interface WxRequestPort {
  request(options: WxRequestOptions): void;
  uploadFile(options: WxUploadOptions): void;
}

interface WxRuntime {
  request(options: WxRequestOptions): void;
  uploadFile(options: WxUploadOptions): void;
}

declare const wx: WxRuntime;

export function createWxRequestPort(): WxRequestPort {
  return { request: (options) => wx.request(options), uploadFile: (options) => wx.uploadFile(options) };
}

export type ApiErrorCode = 'unauthorized' | 'duplicate' | 'payload-too-large' | 'validation' | 'timeout' | 'network' | 'server' | 'unknown';

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  sessions: SessionStore;
  transport?: WxRequestPort;
  cache?: ReadCache;
  requestTimeoutMs?: number;
}

export interface ReadResult<T> extends CachedRead<T> {
  fromCache: boolean;
}

type Query = Record<string, string | number | boolean | undefined>;
type JsonObject = Record<string, unknown>;
type FileUpload = { filePath: string; name?: string; formData?: Record<string, string> };

function errorCode(statusCode: number): ApiErrorCode {
  if (statusCode === 401) return 'unauthorized';
  if (statusCode === 409) return 'duplicate';
  if (statusCode === 413) return 'payload-too-large';
  if (statusCode === 422 || statusCode === 400) return 'validation';
  if (statusCode >= 500) return 'server';
  return 'unknown';
}

function responseMessage(data: unknown, statusCode: number): { message: string; details?: unknown } {
  if (typeof data === 'string') {
    try { return responseMessage(JSON.parse(data), statusCode); } catch { return { message: data }; }
  }
  if (isRecord(data)) {
    const message = data.message;
    if (Array.isArray(message)) return { message: message.map(String).join('; '), details: data };
    if (typeof message === 'string') return { message, details: data };
    if (typeof data.error === 'string') return { message: data.error, details: data };
  }
  return { message: `request failed (${statusCode})`, details: data };
}

function networkError(error: unknown): ApiError {
  const text = error instanceof Error ? error.message : String(error ?? 'network unavailable');
  const timeout = /timeout|超时/i.test(text);
  return new ApiError(0, timeout ? 'timeout' : 'network', timeout ? 'request timed out' : 'network unavailable', error);
}

export class ApiClient {
  private readonly transport: WxRequestPort;
  private readonly timeout: number;

  constructor(private readonly options: ApiClientOptions) {
    this.transport = options.transport ?? createWxRequestPort();
    this.timeout = options.requestTimeoutMs ?? 15_000;
    if (!options.baseUrl.trim()) throw new Error('API base URL is required');
  }

  get<T>(path: string, query: Query = {}): Promise<T> {
    return this.requestJson<T>('GET', path, query, true);
  }

  post<T>(path: string, body: unknown = {}): Promise<T> {
    return this.requestJson<T>('POST', path, body, false);
  }

  upload<T>(path: string, file: FileUpload): Promise<T> {
    const session = this.options.sessions.read();
    const header: Record<string, string> = session ? { Authorization: `Bearer ${session.accessToken}` } : {};
    return new Promise<T>((resolve, reject) => {
      try {
        this.transport.uploadFile({
          url: this.url(path),
          filePath: file.filePath,
          name: file.name ?? 'file',
          formData: file.formData,
          header,
          timeout: this.timeout,
          success: (response) => {
            if (response.statusCode >= 200 && response.statusCode < 300) {
              resolve(this.parseBody<T>(response.data));
            } else {
              reject(this.toApiError(response.statusCode, response.data));
            }
          },
          fail: (error) => reject(networkError(error)),
        });
      } catch (error) {
        reject(networkError(error));
      }
    });
  }

  async read<T>(path: string, query: Query = {}, cacheKey = `${path}?${JSON.stringify(query)}`, maxAgeMs = 5 * 60_000): Promise<ReadResult<T>> {
    try {
      const data = await this.get<T>(path, query);
      this.options.cache?.set(cacheKey, data);
      return { data, cachedAt: Date.now(), fromCache: false };
    } catch (error) {
      const cached = error instanceof ApiError && (error.code === 'network' || error.code === 'timeout')
        ? this.options.cache?.read<T>(cacheKey, maxAgeMs)
        : null;
      if (cached) return { ...cached, fromCache: true };
      throw error;
    }
  }

  fetchSummary(period: Query = {}): Promise<DashboardSummary> { return this.get('/reports/summary', period); }
  fetchReports(period: Query): Promise<ReportSummary> { return this.get('/reports/summary', period); }
  fetchAccounts<T = unknown>(): Promise<T> { return this.get('/accounts'); }
  fetchCategories<T = unknown>(): Promise<T> { return this.get('/categories'); }
  fetchPendingDrafts<T = unknown>(): Promise<T> { return this.get('/drafts'); }
  fetchRecurring(): Promise<RecurringSummary[]> { return this.get('/recurring'); }
  createRecurring(input: JsonObject): Promise<RecurringSummary> { return this.post('/recurring', input); }
  advanceRecurring(id: string): Promise<RecurringSummary> { return this.post(`/recurring/${encodeURIComponent(id)}/advance`); }
  createTransaction<T = TransactionSummary>(input: JsonObject): Promise<T> { return this.post('/transactions', input); }
  stageImport<T = unknown>(input: JsonObject): Promise<T> { return this.post('/imports/stage', input); }
  confirmDraft<T = TransactionSummary>(draftId: string, input: JsonObject = {}): Promise<T> { return this.post(`/drafts/${encodeURIComponent(draftId)}/confirm`, input); }
  previewDuplicates<T = unknown>(input: JsonObject): Promise<T> { return this.post('/duplicate-candidates/preview', input); }
  previewDocument(input: { filePath: string; fileName: string; contentType: string }): Promise<DocumentDraft> {
    return this.upload('/imports/pdf/preview', { filePath: input.filePath, name: 'file' });
  }
  previewAnzCsv(csv: string): Promise<ImportedRow[]> { return this.post('/imports/anz-csv/preview', { csv }); }
  stageAnzCsv(input: { fileHash: string; csv: string }): Promise<StageResult> { return this.post('/imports/anz-csv/stage', input); }
  parseDraft(input: string): Promise<DocumentDraft> { return this.post('/ai/parse-draft', { input }); }
  uploadAttachment(input: { filePath: string; draftId: string; originalName: string; contentType: string }): Promise<unknown> {
    return this.upload(`/attachments/draft/${encodeURIComponent(input.draftId)}`, { filePath: input.filePath, name: 'file' });
  }
  askAi(message: string): Promise<AiAnswer>;
  askAi(input: { conversationId?: string; message: string }): Promise<AiAnswer>;
  askAi(input: string | { conversationId?: string; message: string }): Promise<AiAnswer> {
    return this.post('/ai/chat', typeof input === 'string' ? { message: input } : input);
  }
  listAiConversations(): Promise<AiConversationSummary[]> { return this.get('/ai/conversations'); }
  deleteAiConversation(id: string): Promise<{ deleted: boolean }> { return this.requestJson('DELETE' as RequestMethod, `/ai/conversations/${encodeURIComponent(id)}`, undefined, false); }
  fetchAiInsights(period: Query = {}): Promise<AiInsight[]> { return this.get('/ai/insights', period); }
  fetchMembers(): Promise<HouseholdMember[]> { return this.get('/households/members'); }
  createInvite(expiresInDays = 7): Promise<HouseholdInvite> { return this.post('/households/invites', { expiresInDays }); }
  removeMember(membershipId: string): Promise<unknown> { return this.requestJson('DELETE' as RequestMethod, `/households/members/${encodeURIComponent(membershipId)}`, undefined, false); }
  exportTransactions(period: Query, format: 'json' | 'csv' = 'json'): Promise<unknown> { return this.get('/exports/transactions', { ...period, format }); }
  loginWithWechat(input: { code: string; inviteCode?: string; householdName?: string }): Promise<WechatLoginResponse> { return this.post('/auth/wechat/login', input); }
  async logout(): Promise<void> {
    const session = this.options.sessions.read();
    if (!session) return;
    try { await this.post('/auth/logout', { refreshToken: session.refreshToken }); } finally { this.options.sessions.clear(); }
  }

  private async requestJson<T>(method: RequestMethod | 'DELETE', path: string, data: unknown, canRefresh: boolean): Promise<T> {
    try {
      const response = await this.rawRequest(method, path, data);
      if (response.statusCode >= 200 && response.statusCode < 300) return this.parseBody<T>(response.data);
      if (response.statusCode === 401 && canRefresh && method === 'GET' && path !== '/auth/refresh' && await this.refresh()) {
        return this.requestJson<T>(method, path, data, false);
      }
      throw this.toApiError(response.statusCode, response.data);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw networkError(error);
    }
  }

  private rawRequest(method: RequestMethod | 'DELETE', path: string, data: unknown): Promise<WxResponse> {
    const session = this.options.sessions.read();
    const header: Record<string, string> = session ? { Authorization: `Bearer ${session.accessToken}` } : {};
    return new Promise<WxResponse>((resolve, reject) => {
      try {
        this.transport.request({
          url: this.url(path, method === 'GET' && isRecord(data) ? data as Query : undefined),
          method,
          data: method === 'GET' ? undefined : data,
          header,
          timeout: this.timeout,
          success: resolve,
          fail: reject,
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private async refresh(): Promise<boolean> {
    const current = this.options.sessions.read();
    if (!current) return false;
    try {
      const response = await this.rawRequest('POST', '/auth/refresh', { refreshToken: current.refreshToken });
      if (response.statusCode < 200 || response.statusCode >= 300 || !isRecord(response.data)
        || typeof response.data.accessToken !== 'string' || !response.data.accessToken
        || typeof response.data.refreshToken !== 'string' || !response.data.refreshToken) throw new Error('refresh failed');
      this.options.sessions.save({
        accessToken: response.data.accessToken,
        refreshToken: response.data.refreshToken,
        householdId: typeof response.data.householdId === 'string' && response.data.householdId
          ? response.data.householdId
          : current.householdId,
      } as TokenPair);
      return true;
    } catch {
      this.options.sessions.clear();
      return false;
    }
  }

  private parseBody<T>(data: unknown): T {
    if (typeof data !== 'string') return data as T;
    try { return JSON.parse(data) as T; } catch { return data as T; }
  }

  private toApiError(statusCode: number, data: unknown): ApiError {
    const result = responseMessage(data, statusCode);
    return new ApiError(statusCode, errorCode(statusCode), result.message, result.details);
  }

  private url(path: string, query?: Query): string {
    const base = this.options.baseUrl.replace(/\/$/, '');
    const normalized = path.startsWith('/') ? path : `/${path}`;
    if (!query) return `${base}${normalized}`;
    const params = Object.entries(query).filter(([, value]) => value !== undefined).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    return params.length ? `${base}${normalized}?${params.join('&')}` : `${base}${normalized}`;
  }
}
