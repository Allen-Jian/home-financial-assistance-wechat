import { ApiError } from '../../../src/api/client';
import type { CategorySummary, DocumentDraft, StageResult } from '../../../src/api/contracts';
import { getRuntime } from '../../../app';

export interface PhotoEntryFile {
  path: string;
  name: string;
  size?: number;
  contentType?: string;
  fileHash?: string;
}

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
  file: PhotoEntryFile | null;
  draft: DocumentDraft | null;
  draftId: string;
  originalPreserved: boolean;
  uploaded: boolean;
  loading: boolean;
  confirmed: boolean;
  error: string;
  categories: CategorySummary[];
  categoryId: string;
  categoryName: string;
  stagedExisting: boolean;
}

function contentTypeFor(file: PhotoEntryFile): string {
  if (file.contentType) return file.contentType;
  return /\.png$/i.test(file.name) ? 'image/png' : 'image/jpeg';
}

function hashFor(file: PhotoEntryFile): string {
  if (file.fileHash) return file.fileHash;
  let hash = 2_166_136_261;
  for (const byte of file.path + '\u0000' + file.name) hash = Math.imul(hash ^ byte.charCodeAt(0), 16_777_619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export class PhotoEntryPageModel {
  state: PhotoEntryState = {
    file: null, draft: null, draftId: '', originalPreserved: false,
    uploaded: false, loading: false, confirmed: false, error: '', categories: [], categoryId: '', categoryName: '', stagedExisting: false,
  };
  private readonly editedFields = new Set<keyof DocumentDraft>();

  constructor(private readonly api: PhotoEntryApiPort) {}

  async analyze(file: PhotoEntryFile): Promise<boolean> {
    this.state.file = file;
    this.state.originalPreserved = true;
    this.state.draft = null;
    this.state.draftId = '';
    this.state.uploaded = false;
    this.state.confirmed = false;
    this.state.categoryId = '';
    this.state.categoryName = '';
    this.state.stagedExisting = false;
    this.state.error = '';
    this.editedFields.clear();
    this.state.loading = true;
    try {
      const contentType = contentTypeFor(file);
      const draft = this.api.analyzePhoto
        ? await this.api.analyzePhoto({ filePath: file.path, fileName: file.name, contentType })
        : this.api.previewDocument
          ? await this.api.previewDocument({ filePath: file.path, fileName: file.name, contentType })
          : this.api.parseDraft
            ? await this.api.parseDraft(file.path)
            : (() => { throw new Error('AI 分析暂不可用'); })();
      this.state.draft = draft;
      if (this.api.fetchCategories) {
        const categories = await this.api.fetchCategories();
        this.state.categories = categories.filter((category) => category.active !== false);
        const matched = this.state.categories.find((category) => category.direction === draft.direction && category.name === draft.categoryHint);
        if (matched) {
          this.state.categoryId = matched.id;
          this.state.categoryName = matched.name;
          this.state.draft = { ...draft, categoryId: matched.id };
        }
      }
      if (this.api.stageImport && this.api.confirmDraft) {
        const staged = await this.api.stageImport({ fileHash: hashFor(file), sourceType: 'manual-photo', draft });
        this.state.draftId = staged.draftId ?? staged.draft?.id ?? '';
        if (staged.reused && !this.state.draftId) {
          this.state.stagedExisting = true;
          this.state.error = '该小票已存在，请稍后处理';
        }
        if (!staged.reused && this.api.uploadAttachment && this.state.draftId) {
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
      if (patch.categoryHint !== undefined) {
        const matched = this.state.categories.find((category) => category.direction === this.state.draft?.direction && category.name === patch.categoryHint);
        this.state.categoryId = matched?.id ?? '';
        this.state.categoryName = matched?.name ?? '';
      }
    }
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
    return this.analyze(this.state.file);
  }

  async confirm(): Promise<boolean> {
    const draft = this.state.draft;
    if (!draft) { this.state.error = '请先分析小票'; return false; }
    if (this.state.stagedExisting) { this.state.error = '该小票已存在，请稍后处理'; return false; }
    if (!Number.isSafeInteger(draft.amountMinor) || draft.amountMinor <= 0) { this.state.error = '草稿金额无效'; return false; }
    this.state.loading = true;
    this.state.error = '';
    try {
      if (this.state.draftId && this.api.confirmDraft) {
        await this.api.confirmDraft(this.state.draftId, this.confirmationPayload(draft));
      } else if (this.api.createTransaction) {
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
  chooseMedia(options: { count: number; mediaType: string[]; sourceType: string[]; success: (result: { tempFiles: Array<{ tempFilePath?: string; path?: string; name?: string; size?: number; fileType?: string }> }) => void; fail: (error: unknown) => void }): void;
  navigateTo(options: { url: string }): void;
}
declare const wx: WxPhotoRuntime;

export function createPhotoEntryPage(model: PhotoEntryPageModel) {
  return {
    data: model.state,
    choosePhoto(this: PageContext) {
      wx.chooseMedia({
        count: 1, mediaType: ['image'], sourceType: ['camera', 'album'],
        success: async (result) => {
          const file = result.tempFiles[0];
          if (file) await model.analyze({ path: file.tempFilePath ?? file.path ?? '', name: file.name ?? 'receipt.jpg', size: file.size, contentType: file.fileType === 'png' ? 'image/png' : 'image/jpeg' });
          this.setData(model.state);
        },
        fail: () => this.setData(model.state),
      });
    },
    async retry(this: PageContext) { await model.retry(); this.setData(model.state); },
    openManual() { wx.navigateTo({ url: '/pages/ledger/edit/index' }); },
    onDraftInput(this: PageContext, event: { currentTarget?: { dataset?: { field?: keyof DocumentDraft } }; detail?: { value?: string } }) {
      const field = event.currentTarget?.dataset?.field;
      const value = event.detail?.value;
      if (field && value !== undefined) model.updateDraft({ [field]: field === 'amountMinor' ? Number(value) : value });
      this.setData(model.state);
    },
    onCategoryChange(this: PageContext, event: { detail?: { value?: number } }) { model.setCategoryByIndex(Number(event.detail?.value ?? -1)); this.setData(model.state); },
    async confirm(this: PageContext) { await model.confirm(); this.setData(model.state); },
  };
}

declare function Page(options: Record<string, unknown>): void;
declare function getApp<T>(): T;
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
  const runtime = getRuntime();
  Page(createPhotoEntryPage(new PhotoEntryPageModel(runtime.api as unknown as PhotoEntryApiPort)));
}
