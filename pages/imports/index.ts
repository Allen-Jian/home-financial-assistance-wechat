import type { DocumentDraft, DuplicateCandidate, ImportedRow, StageResult } from '../../src/api/contracts';
import { getRuntime } from '../../app';
import { formatNzdMinor } from '../../src/domain/money';
import { withThemePage } from '../../src/shared/themed-page';

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export type ImportSourceType = 'manual-photo' | 'pdf' | 'anz-csv' | 'text';
export interface PickedImportFile {
  path: string;
  name: string;
  size: number;
  contentType: string;
  bytes?: Uint8Array;
  text?: string;
}

export interface ImportPickerPort {
  chooseMedia(): Promise<PickedImportFile>;
  chooseAlbum(): Promise<PickedImportFile>;
  chooseMessageFile(): Promise<PickedImportFile>;
  readFile(path: string): Promise<Uint8Array | ArrayBuffer | string>;
}

export interface ImportApiPort {
  previewDocument(input: { filePath: string; fileName: string; contentType: string }): Promise<DocumentDraft>;
  parseDraft(input: string): Promise<DocumentDraft>;
  previewAnzCsv(csv: string): Promise<ImportedRow[]>;
  stageImport(input: Record<string, unknown>): Promise<StageResult>;
  stageAnzCsv(input: { fileHash: string; csv: string }): Promise<StageResult>;
  uploadAttachment(input: { filePath: string; draftId: string; originalName: string; contentType: string }): Promise<unknown>;
  previewDuplicates?(input: Record<string, unknown>): Promise<DuplicateCandidate[]>;
  confirmDraft?(draftId: string, input?: Record<string, unknown>): Promise<unknown>;
}

export interface ReconcileRow extends ImportedRow {
  amountDisplay: string;
  selected: boolean;
  candidates: DuplicateCandidate[];
  resolution?: 'later' | 'keep-both';
}

export interface ImportPageState {
  mode: 'bill' | 'statement';
  view: 'upload' | 'analyzing' | 'preview' | 'results';
  file: PickedImportFile | null;
  sourceType: ImportSourceType | null;
  preview: DocumentDraft | null;
  previewAmountDisplay: string;
  rows: ImportedRow[];
  stageResult: StageResult | null;
  uploaded: boolean;
  originalPreserved: boolean;
  loading: boolean;
  error: string;
  textInput: string;
  matched: ReconcileRow[];
  duplicates: ReconcileRow[];
  missing: ReconcileRow[];
  selectedMissingCount: number;
  confirmedMissingCount: number;
}

interface PageContext { setData(data: unknown): void }

interface WxFileRuntime {
  path?: string;
  tempFilePath?: string;
  name?: string;
  size?: number;
  fileType?: string;
  type?: string;
}

interface WxImportRuntime {
  chooseMedia(options: { count: number; mediaType: string[]; sourceType: string[]; success: (result: { tempFiles: WxFileRuntime[] }) => void; fail: (error: unknown) => void }): void;
  chooseMessageFile(options: { count: number; type: string; success: (result: { tempFiles: WxFileRuntime[] }) => void; fail: (error: unknown) => void }): void;
  getFileSystemManager(): { readFile(options: { filePath: string; success: (result: { data: ArrayBuffer | string }) => void; fail: (error: unknown) => void }): void };
}

declare const wx: WxImportRuntime;

function toPickedFile(file: WxFileRuntime, fallbackType: string): PickedImportFile {
  const path = file.tempFilePath ?? file.path ?? '';
  const rawType = file.fileType ?? file.type ?? fallbackType;
  const contentType = rawType === 'image' ? 'image/jpeg' : rawType === 'pdf' ? 'application/pdf' : rawType === 'csv' ? 'text/csv' : rawType;
  return { path, name: file.name ?? path.split('/').pop() ?? 'import', size: file.size ?? 0, contentType };
}

function createImportPicker(): ImportPickerPort {
  return {
    chooseMedia: () => new Promise((resolve, reject) => wx.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: ['camera'],
      success: (result) => resolve(toPickedFile(result.tempFiles[0] ?? {}, 'image/jpeg')),
      fail: reject,
    })),
    chooseAlbum: () => new Promise((resolve, reject) => wx.chooseMedia({
      count: 1, mediaType: ['image'], sourceType: ['album'],
      success: (result) => resolve(toPickedFile(result.tempFiles[0] ?? {}, 'image/jpeg')),
      fail: reject,
    })),
    chooseMessageFile: () => new Promise((resolve, reject) => wx.chooseMessageFile({
      count: 1, type: 'all',
      success: (result) => resolve(toPickedFile(result.tempFiles[0] ?? {}, 'application/octet-stream')),
      fail: reject,
    })),
    readFile: (path) => new Promise((resolve, reject) => wx.getFileSystemManager().readFile({
      filePath: path, success: (result) => resolve(result.data), fail: reject,
    })),
  };
}

type FileContent = Uint8Array | string;

function asBytes(content: FileContent): Uint8Array {
  if (typeof content !== 'string') return content;
  return new TextEncoder().encode(content);
}

function asText(content: FileContent): string {
  return typeof content === 'string' ? content : new TextDecoder().decode(content);
}

function signatureMatches(file: PickedImportFile, content: FileContent): boolean {
  const bytes = asBytes(content);
  if (file.contentType === 'application/pdf') return asText(content).startsWith('%PDF-');
  if (file.contentType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.contentType === 'image/png') return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  return true;
}

function simpleHash(content: FileContent): string {
  let hash = 2_166_136_261;
  for (const byte of asBytes(content)) hash = Math.imul(hash ^ byte, 16_777_619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export class ImportPageModel {
  state: ImportPageState = {
    mode: 'bill', view: 'upload', file: null, sourceType: null, preview: null, previewAmountDisplay: '', rows: [], stageResult: null, uploaded: false,
    originalPreserved: false, loading: false, error: '', textInput: '', matched: [], duplicates: [], missing: [], selectedMissingCount: 0, confirmedMissingCount: 0,
  };
  private content: FileContent | null = null;
  private readonly staged = new Map<string, StageResult>();

  constructor(
    private readonly picker: ImportPickerPort,
    private readonly api: ImportApiPort,
    private readonly hashFile: (content: FileContent) => string | Promise<string> = simpleHash,
  ) {}

  setMode(mode: string | undefined): void {
    this.state.mode = mode === 'statement' ? 'statement' : 'bill';
    this.state.view = 'upload';
  }

  choosePhoto(): Promise<boolean> { return this.select(this.picker.chooseMedia(), 'manual-photo'); }

  chooseAlbum(): Promise<boolean> { return this.select(this.picker.chooseAlbum(), 'manual-photo'); }

  async chooseFile(): Promise<boolean> {
    try {
      const file = await this.picker.chooseMessageFile();
      const type: ImportSourceType | null = file.contentType === 'application/pdf' ? 'pdf' : file.contentType === 'text/csv' ? 'anz-csv' : file.contentType.startsWith('image/') ? 'manual-photo' : null;
      return type ? this.select(Promise.resolve(file), type) : this.reject('文件类型不受支持');
    } catch (error) {
      return this.reject(error instanceof Error ? error.message : '文件选择失败');
    }
  }

  chooseCsv(): Promise<boolean> { return this.select(this.picker.chooseMessageFile(), 'anz-csv'); }

  toggleMissing(sourceFingerprint: string): void {
    this.state.missing = this.state.missing.map((row) => row.sourceFingerprint === sourceFingerprint ? { ...row, selected: !row.selected } : row);
    this.state.selectedMissingCount = this.state.missing.filter((row) => row.selected).length;
  }

  async confirmSelectedMissing(): Promise<boolean> {
    const selected = this.state.missing.filter((row) => row.selected);
    if (!selected.length) return this.reject('请先选择需要补录的账目');
    if (!this.content || !this.api.confirmDraft) return this.reject('补录接口暂不可用');
    this.state.loading = true;
    this.state.error = '';
    try {
      const baseHash = await this.hashFile(this.content);
      for (const row of selected) {
        const result = await this.api.stageImport({
          fileHash: `${baseHash}:${row.sourceFingerprint}`,
          sourceType: 'anz-csv',
          draft: { amountMinor: row.amountMinor, direction: row.direction, occurredAt: row.date, merchant: row.merchant, sourceFingerprint: row.sourceFingerprint },
        });
        const draftId = result.draft?.id ?? result.draftId;
        if (!draftId) throw new Error('未能生成待确认草稿');
        await this.api.confirmDraft(draftId, {});
      }
      this.state.confirmedMissingCount = selected.length;
      this.state.missing = this.state.missing.filter((row) => !row.selected);
      this.state.selectedMissingCount = 0;
      return true;
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : '补录失败，请稍后重试';
      return false;
    } finally {
      this.state.loading = false;
    }
  }

  async resolveDuplicate(sourceFingerprint: string, action: 'later' | 'keep-both'): Promise<boolean> {
    const row = this.state.duplicates.find((item) => item.sourceFingerprint === sourceFingerprint);
    if (!row) return false;
    if (action === 'later') {
      row.resolution = 'later';
      return true;
    }
    if (!this.content || !this.api.confirmDraft) return this.reject('补录接口暂不可用');
    try {
      const baseHash = await this.hashFile(this.content);
      const result = await this.api.stageImport({ fileHash: `${baseHash}:${row.sourceFingerprint}:keep`, sourceType: 'anz-csv', draft: row });
      const draftId = result.draft?.id ?? result.draftId;
      if (!draftId) throw new Error('未能生成待确认草稿');
      await this.api.confirmDraft(draftId, { allowDuplicate: true });
      row.resolution = 'keep-both';
      return true;
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : '重复项处理失败';
      return false;
    }
  }

  async parseText(input: string): Promise<boolean> {
    const value = input.trim();
    if (!value) return this.reject('请输入一笔账目描述');
    this.state.loading = true;
    this.state.error = '';
    try {
      this.state.preview = await this.api.parseDraft(value);
      this.state.previewAmountDisplay = formatNzdMinor(this.state.preview.amountMinor);
      this.state.file = null;
      this.state.sourceType = 'text';
      this.state.textInput = value;
      this.state.rows = [];
      this.state.stageResult = null;
      this.state.uploaded = false;
      this.state.originalPreserved = true;
      this.content = value;
      return true;
    } catch (error) {
      this.state.originalPreserved = true;
      this.state.error = error instanceof Error ? error.message : 'AI 解析失败，请手工录入';
      return false;
    } finally {
      this.state.loading = false;
    }
  }

  async stage(): Promise<boolean> {
    const file = this.state.file;
    if (!this.content || !this.state.sourceType) return this.reject('请先选择文件或输入账目描述');
    this.state.loading = true;
    this.state.error = '';
    try {
      const fileHash = await this.hashFile(this.content);
      const previous = this.staged.get(fileHash);
      if (previous) {
        this.state.stageResult = previous;
        return true;
      }
      const result = this.state.sourceType === 'anz-csv'
        ? await this.api.stageAnzCsv({ fileHash, csv: asText(this.content) })
        : await this.api.stageImport({ fileHash, sourceType: this.state.sourceType, draft: this.state.preview ?? undefined });
      this.state.stageResult = result;
      this.staged.set(fileHash, result);
      const draftId = result.draft?.id ?? result.draftId;
      if (!result.reused && file && this.state.sourceType !== 'anz-csv' && draftId) {
        await this.api.uploadAttachment({ filePath: file.path, draftId, originalName: file.name, contentType: file.contentType });
        this.state.uploaded = true;
      }
      return true;
    } catch (error) {
      this.state.originalPreserved = true;
      this.state.error = error instanceof Error ? error.message : '文件处理失败，请重试';
      return false;
    } finally {
      this.state.loading = false;
    }
  }

  private async select(filePromise: Promise<PickedImportFile>, sourceType: ImportSourceType): Promise<boolean> {
    this.state.loading = true;
    this.state.view = this.state.mode === 'statement' ? 'analyzing' : 'preview';
    this.state.error = '';
    try {
      const file = await filePromise;
      if (file.size > MAX_IMPORT_BYTES) return this.reject('文件不能超过 20 MB');
      const content = file.bytes ?? file.text ?? await this.picker.readFile(file.path);
      if (content instanceof ArrayBuffer) this.content = new Uint8Array(content); else this.content = content;
      if (!signatureMatches(file, this.content)) return this.reject('文件类型与内容签名不匹配');
      this.state.file = file;
      this.state.sourceType = sourceType;
      this.state.preview = null;
      this.state.previewAmountDisplay = '';
      this.state.rows = [];
      this.state.stageResult = null;
      this.state.uploaded = false;
      this.state.originalPreserved = true;
      this.state.textInput = '';
      if (sourceType === 'anz-csv') this.state.rows = await this.api.previewAnzCsv(asText(this.content));
      else {
        this.state.preview = await this.api.previewDocument({ filePath: file.path, fileName: file.name, contentType: file.contentType });
        this.state.previewAmountDisplay = formatNzdMinor(this.state.preview.amountMinor);
      }
      if (this.state.mode === 'statement') {
        if (!this.state.rows.length && this.state.preview) {
          this.state.rows = [{
            date: this.state.preview.occurredAt ?? new Date().toISOString().slice(0, 10),
            amountMinor: this.state.preview.amountMinor,
            direction: this.state.preview.direction,
            merchant: this.state.preview.merchant,
            sourceFingerprint: `${file.name}:0`,
          }];
        }
        await this.analyzeStatement();
        this.state.view = 'results';
      }
      return true;
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : '文件处理失败，请重试';
      this.state.originalPreserved = true;
      return false;
    } finally {
      this.state.loading = false;
    }
  }

  private reject(message: string): false { this.state.error = message; this.state.loading = false; return false; }

  private async analyzeStatement(): Promise<void> {
    const classified = await Promise.all(this.state.rows.map(async (row): Promise<{ row: ReconcileRow; kind: 'matched' | 'duplicate' | 'missing' }> => {
      const candidates = this.api.previewDuplicates ? await this.api.previewDuplicates({
        id: row.sourceFingerprint,
        amountMinor: row.amountMinor,
        direction: row.direction,
        occurredAt: /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? `${row.date}T00:00:00.000Z` : row.date,
        merchant: row.merchant,
        sourceFingerprint: row.sourceFingerprint,
      }) : [];
      const item: ReconcileRow = { ...row, amountDisplay: `${row.direction === 'expense' ? '−' : '+'} ${formatNzdMinor(row.amountMinor)}`, selected: candidates.length === 0, candidates };
      return { row: item, kind: candidates.some((candidate) => candidate.score >= 95) ? 'matched' : candidates.length ? 'duplicate' : 'missing' };
    }));
    this.state.matched = classified.filter((item) => item.kind === 'matched').map((item) => item.row);
    this.state.duplicates = classified.filter((item) => item.kind === 'duplicate').map((item) => item.row);
    this.state.missing = classified.filter((item) => item.kind === 'missing').map((item) => item.row);
    this.state.selectedMissingCount = this.state.missing.length;
  }
}

export function createImportPage(model: ImportPageModel) {
  return {
    data: model.state,
    onLoad(this: PageContext, options: { mode?: string } = {}) { model.setMode(options.mode); this.setData(model.state); },
    async choosePhoto(this: PageContext) { const pending = model.choosePhoto(); this.setData(model.state); await pending; this.setData(model.state); },
    async chooseAlbum(this: PageContext) { const pending = model.chooseAlbum(); this.setData(model.state); await pending; this.setData(model.state); },
    async chooseFile(this: PageContext) { const pending = model.chooseFile(); this.setData(model.state); await pending; this.setData(model.state); },
    async chooseCsv(this: PageContext) { const pending = model.chooseCsv(); this.setData(model.state); await pending; this.setData(model.state); },
    async parseText(this: PageContext, event: { detail?: { value?: string } }) { await model.parseText(event.detail?.value ?? ''); this.setData(model.state); },
    async stage(this: PageContext) { await model.stage(); this.setData(model.state); },
    toggleMissing(this: PageContext, event: { currentTarget?: { dataset?: { id?: string } } }) { model.toggleMissing(event.currentTarget?.dataset?.id ?? ''); this.setData(model.state); },
    async confirmSelectedMissing(this: PageContext) { await model.confirmSelectedMissing(); this.setData(model.state); },
    async resolveDuplicate(this: PageContext, event: { currentTarget?: { dataset?: { id?: string; action?: string } } }) {
      const action = event.currentTarget?.dataset?.action;
      if (action === 'later' || action === 'keep-both') await model.resolveDuplicate(event.currentTarget?.dataset?.id ?? '', action);
      this.setData(model.state);
    },
  };
}

declare function Page(options: Record<string, unknown>): void;
declare function getApp<T>(): unknown;
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
  const runtime = getRuntime();
  Page(withThemePage(createImportPage(new ImportPageModel(createImportPicker(), runtime.api as unknown as ImportApiPort)), runtime.theme));
}
