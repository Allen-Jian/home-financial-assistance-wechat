import { ApiError } from '../../../src/api/client';
import type { CategorySummary, DocumentDraft, StageResult } from '../../../src/api/contracts';
import { getRuntime } from '../../../app';
import { parseNzdMinor } from '../../../src/domain/money';
import { copy } from '../../../src/shared/copy';
import { withThemePage } from '../../../src/shared/themed-page';

export interface PhotoEntryFile {
  path: string;
  name: string;
  size?: number;
  contentType?: string;
  fileHash?: string;
  bytes?: Uint8Array;
}

export type ImageSource = 'camera' | 'album' | 'chat-image';

export interface PhotoEntryApiPort {
  parseDraft?: (input: string) => Promise<DocumentDraft>;
  analyzePhoto?: (input: { filePath: string; fileName: string; contentType: string }) => Promise<DocumentDraft>;
  previewDocument?: (input: { filePath: string; fileName: string; contentType: string }) => Promise<DocumentDraft>;
  stageImport?: (input: Record<string, unknown>) => Promise<Partial<StageResult> & { batch?: { id?: string }; draft?: { id?: string } }>;
  uploadAttachment?: (input: { filePath: string; draftId: string; originalName: string; contentType: string }) => Promise<unknown>;
  confirmDraft?: (draftId: string, input?: Record<string, unknown>) => Promise<unknown>;
  createTransaction?: (input: Record<string, unknown>) => Promise<unknown>;
  fetchCategories?: () => Promise<CategorySummary[]>;
}

export interface PhotoEntryState {
  source: 'photo' | 'bill';
  file: PhotoEntryFile | null;
  draft: DocumentDraft | null;
  amount: string;
  needsCategoryReview: boolean;
  draftId: string;
  originalPreserved: boolean;
  uploaded: boolean;
  loading: boolean;
  confirmed: boolean;
  error: string;
  categories: CategorySummary[];
  visibleCategories: CategorySummary[];
  categoryId: string;
  categoryName: string;
  stagedExisting: boolean;
}

function contentTypeFor(file: PhotoEntryFile): string {
  if (file.contentType) return file.contentType;
  return /\.png$/i.test(file.name) ? 'image/png' : 'image/jpeg';
}

function imageContentTypeForBytes(bytes: Uint8Array): 'image/jpeg' | 'image/png' | undefined {
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return undefined;
}

export function isPickerCancel(error: unknown): boolean {
  const messages: unknown[] = [];
  if (typeof error === 'string') messages.push(error);
  if (error instanceof Error) messages.push(error.message);
  if (error && typeof error === 'object') {
    const details = error as { errMsg?: unknown; message?: unknown };
    messages.push(details.errMsg, details.message);
  }
  return messages.some((message) => typeof message === 'string' && (/cancel(?:led|ed)?/i.test(message) || /取消/.test(message)));
}

const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

function signatureMatches(file: PhotoEntryFile, contentType: string): boolean {
  const bytes = file.bytes;
  if (!bytes) return true;
  if (contentType === 'application/pdf') return new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
  if (contentType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === 'image/png') return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  return false;
}

function hashFor(file: PhotoEntryFile): string | undefined {
  if (file.fileHash) return file.fileHash;
  if (!file.bytes) return undefined;
  let hash = 2_166_136_261;
  for (const byte of file.bytes) hash = Math.imul(hash ^ byte, 16_777_619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export class PhotoEntryPageModel {
  state: PhotoEntryState = {
    source: 'photo', file: null, draft: null, amount: '', needsCategoryReview: false, draftId: '', originalPreserved: false,
    uploaded: false, loading: false, confirmed: false, error: '', categories: [], visibleCategories: [], categoryId: '', categoryName: '', stagedExisting: false,
  };
  private readonly editedFields = new Set<keyof DocumentDraft>();
  private stagedFileHash = '';
  private stagedContentType = '';

  constructor(
    private readonly api: PhotoEntryApiPort,
    private readonly isOnline: () => boolean = () => true,
    private readonly readFile?: (path: string) => Promise<Uint8Array>,
  ) {}

  setSource(source: string | undefined): void { this.state.source = source === 'bill' ? 'bill' : 'photo'; }

  preserveFileError(file: PhotoEntryFile, error: unknown): void {
    this.state.file = file;
    this.state.originalPreserved = true;
    this.state.loading = false;
    this.state.error = error instanceof Error ? error.message : '读取文件失败，请重新选择';
  }

  private ensureOnline(): boolean {
    if (this.isOnline()) return true;
    this.state.loading = false;
    this.state.originalPreserved = true;
    this.state.error = copy.networkRequired;
    return false;
  }

  async analyze(file: PhotoEntryFile): Promise<boolean> {
    this.state.file = file;
    this.state.originalPreserved = true;
    if (!this.ensureOnline()) return false;
    this.state.draft = null;
    this.state.amount = '';
    this.state.needsCategoryReview = false;
    this.state.draftId = '';
    this.state.uploaded = false;
    this.state.confirmed = false;
    this.state.categoryId = '';
    this.state.categoryName = '';
    this.state.stagedExisting = false;
    this.state.error = '';
    this.editedFields.clear();
    this.stagedFileHash = '';
    this.stagedContentType = '';
    this.state.loading = true;
    try {
      const contentType = contentTypeFor(file);
      if (Math.max(file.size ?? 0, file.bytes?.byteLength ?? 0) > MAX_IMPORT_BYTES) throw new Error('文件不能超过 20 MB');
      if (!['image/jpeg', 'image/png', 'application/pdf'].includes(contentType)) throw new Error('文件类型不受支持');
      if (!signatureMatches(file, contentType)) throw new Error('文件类型与内容签名不匹配');
      const fileHash = hashFor(file);
      if (this.api.stageImport && !fileHash) throw new Error('无法读取文件内容，请重新选择');
      if (!this.ensureOnline()) return false;
      const draft = this.api.analyzePhoto
        ? await this.api.analyzePhoto({ filePath: file.path, fileName: file.name, contentType })
        : this.api.previewDocument
          ? await this.api.previewDocument({ filePath: file.path, fileName: file.name, contentType })
          : this.api.parseDraft
            ? await this.api.parseDraft(file.path)
            : (() => { throw new Error('AI 分析暂不可用'); })();
      this.state.draft = draft;
      this.state.amount = (draft.amountMinor / 100).toFixed(2);
      this.state.needsCategoryReview = (draft.fieldConfidence?.category ?? draft.confidence ?? 1) < 0.8;
      if (this.api.fetchCategories) {
        const categories = await this.api.fetchCategories();
        this.state.categories = categories.filter((category) => category.active !== false);
        this.refreshVisibleCategories();
        const matched = this.state.categories.find((category) => category.direction === draft.direction && category.name === draft.categoryHint);
        if (matched) {
          this.state.categoryId = matched.id;
          this.state.categoryName = matched.name;
          this.state.draft = { ...draft, categoryId: matched.id };
        }
      }
      if (this.api.stageImport && this.api.confirmDraft) {
        if (!this.ensureOnline()) return false;
        const staged = await this.api.stageImport({ fileHash, sourceType: contentType === 'application/pdf' ? 'pdf' : 'manual-photo', draft: this.state.draft ?? draft });
        this.state.draftId = staged.draftId ?? staged.draft?.id ?? '';
        this.stagedFileHash = fileHash ?? '';
        this.stagedContentType = contentType;
        if (staged.reused && !this.state.draftId) {
          this.state.stagedExisting = true;
          this.state.error = '该小票已存在，请稍后处理';
        }
        if (this.api.uploadAttachment && this.state.draftId) {
          if (!this.ensureOnline()) return false;
          await this.api.uploadAttachment({ filePath: file.path, draftId: this.state.draftId, originalName: file.name, contentType });
          this.state.uploaded = true;
        }
      }
      return true;
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : 'AI 分析失败，请改为手工录入';
      return false;
    } finally {
      this.state.loading = false;
    }
  }

  updateDraft(patch: Partial<DocumentDraft>): void {
    if (this.state.draft) {
      this.state.draft = { ...this.state.draft, ...patch };
      Object.keys(patch).forEach((field) => this.editedFields.add(field as keyof DocumentDraft));
      if (patch.categoryId !== undefined) this.state.categoryId = patch.categoryId;
      if (patch.direction !== undefined) {
        this.refreshVisibleCategories();
        if (!this.state.visibleCategories.some((category) => category.id === this.state.categoryId)) {
          this.state.categoryId = '';
          this.state.categoryName = '';
        }
      }
      if (patch.categoryHint !== undefined) {
        const matched = this.state.categories.find((category) => category.direction === this.state.draft?.direction && category.name === patch.categoryHint);
        this.state.categoryId = matched?.id ?? '';
        this.state.categoryName = matched?.name ?? '';
      }
    }
  }

  private refreshVisibleCategories(): void {
    const direction = this.state.draft?.direction;
    this.state.visibleCategories = this.state.categories.filter((category) => category.direction === direction);
  }

  updateAmount(value: string): void {
    this.state.amount = value;
    try { this.updateDraft({ amountMinor: parseNzdMinor(value) }); } catch { /* keep incomplete user input until save */ }
  }

  setCategoryByIndex(index: number): void {
    const category = this.state.categories[index];
    if (category) {
      this.state.categoryId = category.id;
      this.state.categoryName = category.name;
      this.updateDraft({ categoryId: category.id });
    }
  }

  async retry(): Promise<boolean> {
    if (!this.state.file) return false;
    if (!this.ensureOnline()) return false;
    if (!this.state.file.bytes && this.readFile) {
      try {
        const bytes = await this.readFile(this.state.file.path);
        return this.analyze({ ...this.state.file, bytes });
      } catch (error) {
        this.preserveFileError(this.state.file, error);
        return false;
      }
    }
    if (this.state.draftId && !this.state.uploaded && this.api.uploadAttachment && this.stagedFileHash === hashFor(this.state.file)) {
      this.state.loading = true;
      this.state.error = '';
      try {
        if (!this.ensureOnline()) return false;
        await this.api.uploadAttachment({ filePath: this.state.file.path, draftId: this.state.draftId, originalName: this.state.file.name, contentType: this.stagedContentType || contentTypeFor(this.state.file) });
        this.state.uploaded = true;
        return true;
      } catch (error) {
        this.state.error = error instanceof Error ? error.message : '原件上传失败，请重试';
        return false;
      } finally { this.state.loading = false; }
    }
    return this.analyze(this.state.file);
  }

  async confirm(): Promise<boolean> {
    const draft = this.state.draft;
    if (!draft) { this.state.error = '请先分析小票'; return false; }
    if (this.state.stagedExisting) { this.state.error = '该小票已存在，请稍后处理'; return false; }
    if (!Number.isSafeInteger(draft.amountMinor) || draft.amountMinor <= 0) { this.state.error = '草稿金额无效'; return false; }
    if (!this.ensureOnline()) return false;
    this.state.loading = true;
    this.state.error = '';
    try {
      if (this.state.draftId && this.api.confirmDraft) {
        if (this.api.uploadAttachment && !this.state.uploaded) {
          if (!this.state.file || !this.ensureOnline()) return false;
          await this.api.uploadAttachment({ filePath: this.state.file.path, draftId: this.state.draftId, originalName: this.state.file.name, contentType: this.stagedContentType || contentTypeFor(this.state.file) });
          this.state.uploaded = true;
        }
        if (!this.ensureOnline()) return false;
        await this.api.confirmDraft(this.state.draftId, this.confirmationPayload(draft));
      } else if (this.api.createTransaction) {
        if (!this.ensureOnline()) return false;
        const payload = this.confirmationPayload(draft);
        await this.api.createTransaction(payload);
      } else {
        throw new Error('确认接口暂不可用');
      }
      this.state.confirmed = true;
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 409) this.state.error = '发现可能重复，请稍后处理';
      else this.state.error = error instanceof Error ? error.message : '确认入账失败，请稍后重试';
      return false;
    } finally {
      this.state.loading = false;
    }
  }

  private confirmationPayload(draft: DocumentDraft): Record<string, unknown> {
    const payload: Record<string, unknown> = { direction: draft.direction, amountMinor: draft.amountMinor };
    if (draft.occurredAt) payload.occurredAt = draft.occurredAt;
    const categoryId = this.state.categoryId;
    if (categoryId) payload.categoryId = categoryId;
    if (this.editedFields.has('merchant') || draft.merchant) payload.merchant = draft.merchant ?? '';
    if (this.editedFields.has('note') || draft.note) payload.note = draft.note ?? '';
    return payload;
  }
}

interface PageContext { setData(data: unknown): void }
interface WxPhotoRuntime {
  getNetworkType?(options: { success: (result: { networkType?: string }) => void; fail?: () => void }): void;
  onNetworkStatusChange?(listener: (result: { isConnected?: boolean; networkType?: string }) => void): void;
  chooseMedia(options: { count: number; mediaType: string[]; sourceType: string[]; success: (result: { tempFiles: Array<{ tempFilePath?: string; path?: string; name?: string; size?: number; fileType?: string }> }) => void; fail: (error: unknown) => void }): void;
  navigateTo(options: { url: string }): void;
  navigateBack(options?: { delta?: number }): void;
  chooseMessageFile(options: { count: number; type: string; success: (result: { tempFiles: Array<{ path?: string; tempFilePath?: string; name?: string; size?: number; type?: string }> }) => void; fail: (error: unknown) => void }): void;
  getFileSystemManager(): { readFile(options: { filePath: string; success: (result: { data: ArrayBuffer }) => void; fail: (error: unknown) => void }): void };
}
declare const wx: WxPhotoRuntime;

function readFileBytes(path: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => wx.getFileSystemManager().readFile({
    filePath: path,
    success: (result) => resolve(new Uint8Array(result.data)),
    fail: reject,
  }));
}

function createOnlineStatus(): () => boolean {
  let online = true;
  if (typeof wx === 'undefined' || !wx.getNetworkType) return () => online;
  wx.getNetworkType({ success: (result) => { online = result.networkType !== 'none'; }, fail: () => { online = false; } });
  wx.onNetworkStatusChange?.((result) => { online = result.isConnected !== false && result.networkType !== 'none'; });
  return () => online;
}

interface WxImageFileRuntime {
  path?: string;
  tempFilePath?: string;
  name?: string;
  size?: number;
  fileType?: string;
  type?: string;
}

class SelectedFileError extends Error {
  constructor(readonly file: PhotoEntryFile, cause: unknown) {
    super(cause instanceof Error ? cause.message : '读取文件失败，请重新选择');
    this.name = 'SelectedFileError';
  }
}

function toImageFile(file: WxImageFileRuntime): PhotoEntryFile {
  const path = file.tempFilePath ?? file.path ?? '';
  const name = file.name ?? path.split('/').pop() ?? 'receipt.jpg';
  const rawType = file.fileType ?? file.type;
  const contentType = rawType === 'png' || /\.png$/i.test(name)
    ? 'image/png'
    : 'image/jpeg';
  return { path, name, size: file.size, contentType };
}

export function chooseImage(source: ImageSource): Promise<PhotoEntryFile> {
  return new Promise((resolve, reject) => {
    const success = async (result: { tempFiles: WxImageFileRuntime[] }) => {
      const selected = toImageFile(result.tempFiles[0] ?? {});
      if (!selected.path) {
        reject(new Error('未选择图片'));
        return;
      }
      try {
        selected.bytes = await readFileBytes(selected.path);
        const contentType = imageContentTypeForBytes(selected.bytes);
        if (!contentType) throw new Error('文件类型与内容签名不匹配');
        selected.contentType = contentType;
        resolve(selected);
      } catch (error) {
        reject(new SelectedFileError(selected, error));
      }
    };
    const fail = (error: unknown) => reject(error);
    if (source === 'chat-image') {
      wx.chooseMessageFile({ count: 1, type: 'image', success, fail });
    } else {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: [source],
        success,
        fail,
      });
    }
  });
}

async function selectImage(model: PhotoEntryPageModel, context: PageContext, source: ImageSource): Promise<void> {
  try {
    const selected = await chooseImage(source);
    const pending = model.analyze(selected);
    context.setData(model.state);
    await pending;
  } catch (error) {
    if (!isPickerCancel(error)) {
      if (error instanceof SelectedFileError) model.preserveFileError(error.file, error);
      else model.state.error = error instanceof Error ? error.message : '图片选择失败，请重试';
    }
  }
  context.setData(model.state);
}

export function createPhotoEntryPage(model: PhotoEntryPageModel) {
  let lastImageSource: ImageSource | null = null;
  const chooseSource = (context: PageContext, source: ImageSource) => {
    lastImageSource = source;
    return selectImage(model, context, source);
  };
  return {
    data: model.state,
    onLoad(this: PageContext, options: { source?: string } = {}) { model.setSource(options.source); this.setData(model.state); },
    chooseImage(this: PageContext, source: ImageSource) { return chooseSource(this, source); },
    choosePhoto(this: PageContext) { return chooseSource(this, 'camera'); },
    chooseAlbum(this: PageContext) { return chooseSource(this, 'album'); },
    chooseChatImage(this: PageContext) { return chooseSource(this, 'chat-image'); },
    chooseBillFile(this: PageContext): Promise<void> {
      return new Promise((resolve) => wx.chooseMessageFile({
        count: 1, type: 'all',
        success: async (result) => {
          const file = result.tempFiles[0];
          if (file) {
            const name = file.name ?? 'bill.pdf';
            const contentType = /\.pdf$/i.test(name) || file.type === 'pdf' ? 'application/pdf' : /\.png$/i.test(name) ? 'image/png' : 'image/jpeg';
            const path = file.tempFilePath ?? file.path ?? '';
            const selected = { path, name, size: file.size, contentType };
            try {
              const pending = model.analyze({ ...selected, bytes: await readFileBytes(path) });
              this.setData(model.state);
              await pending;
            } catch (error) { model.preserveFileError(selected, error); }
          }
          this.setData(model.state);
          resolve();
        },
        fail: () => { this.setData(model.state); resolve(); },
      }));
    },
    async retry(this: PageContext) {
      if (!model.state.file && lastImageSource) await chooseSource(this, lastImageSource);
      else await model.retry();
      this.setData(model.state);
    },
    openManual() { wx.navigateTo({ url: '/pages/ledger/edit/index' }); },
    close() { wx.navigateBack({ delta: 1 }); },
    onAmountInput(this: PageContext, event: { detail?: { value?: string } }) { model.updateAmount(event.detail?.value ?? ''); this.setData(model.state); },
    onDraftInput(this: PageContext, event: { currentTarget?: { dataset?: { field?: keyof DocumentDraft } }; detail?: { value?: string } }) {
      const field = event.currentTarget?.dataset?.field;
      const value = event.detail?.value;
      if (field && value !== undefined) model.updateDraft({ [field]: field === 'amountMinor' ? Number(value) : value });
      this.setData(model.state);
    },
    onCategoryChange(this: PageContext, event: { detail?: { value?: number } }) { model.setCategoryByIndex(Number(event.detail?.value ?? -1)); this.setData(model.state); },
    onCategoryTap(this: PageContext, event: { currentTarget?: { dataset?: { id?: string } } }) {
      const id = event.currentTarget?.dataset?.id ?? '';
      const category = model.state.visibleCategories.find((item) => item.id === id);
      if (category) model.updateDraft({ categoryId: category.id, categoryHint: category.name });
      this.setData(model.state);
    },
    onDirectionChange(this: PageContext, event: { currentTarget?: { dataset?: { value?: string } } }) {
      const value = event.currentTarget?.dataset?.value;
      if (value === 'income' || value === 'expense') model.updateDraft({ direction: value });
      this.setData(model.state);
    },
    onDateChange(this: PageContext, event: { detail?: { value?: string } }) { model.updateDraft({ occurredAt: event.detail?.value ?? '' }); this.setData(model.state); },
    async confirm(this: PageContext) { await model.confirm(); this.setData(model.state); },
  };
}

declare function Page(options: Record<string, unknown>): void;
declare function getApp<T>(): T;
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
  const runtime = getRuntime();
  const isOnline = createOnlineStatus();
  Page(withThemePage(createPhotoEntryPage(new PhotoEntryPageModel(runtime.api as unknown as PhotoEntryApiPort, isOnline, readFileBytes)), runtime.theme));
}
