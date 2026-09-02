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

interface StageSnapshot {
  content: FileContent;
  file: PickedImportFile | null;
  sourceType: ImportSourceType;
  preview: DocumentDraft | null;
  revision: number;
}

interface StageOutcome {
  ok: boolean;
  result?: StageResult;
  error?: string;
}

interface DuplicateSnapshot {
  row: ReconcileRow;
  content: FileContent;
  revision: number;
}

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
  private readonly uploadCompleted = new Set<string>();
  private readonly stageInFlight = new Map<string, Promise<StageOutcome>>();
  private selectionRevision = 0;
  private confirmMissingInFlight: Promise<boolean> | null = null;
  private readonly duplicateInFlight = new Map<string, Promise<boolean>>();

  constructor(
    private readonly picker: ImportPickerPort,
    private readonly api: ImportApiPort,
    private readonly hashFile: (content: FileContent) => string | Promise<string> = simpleHash,
  ) {}

  setMode(mode: string | undefined): void {
    this.state.mode = mode === 'statement' ? 'statement' : 'bill';
    this.state.view = 'upload';
  }

  choosePhoto(): Promise<boolean> {
    const revision = this.beginSelection();
    return this.select(this.picker.chooseMedia(), 'manual-photo', revision);
  }

  chooseAlbum(): Promise<boolean> {
    const revision = this.beginSelection();
    return this.select(this.picker.chooseAlbum(), 'manual-photo', revision);
  }

  async chooseFile(): Promise<boolean> {
    const revision = this.beginSelection();
    try {
      const file = await this.picker.chooseMessageFile();
      if (!this.isCurrent(revision)) return false;
      const type: ImportSourceType | null = file.contentType === 'application/pdf' ? 'pdf' : file.contentType === 'text/csv' ? 'anz-csv' : file.contentType.startsWith('image/') ? 'manual-photo' : null;
      return type ? this.select(Promise.resolve(file), type, revision) : this.reject('文件类型不受支持', revision);
    } catch (error) {
      return this.isCurrent(revision) ? this.reject(error instanceof Error ? error.message : '文件选择失败', revision) : false;
    }
  }

  chooseCsv(): Promise<boolean> {
    const revision = this.beginSelection();
    return this.select(this.picker.chooseMessageFile(), 'anz-csv', revision);
  }

  toggleMissing(sourceFingerprint: string): void {
    this.state.missing = this.state.missing.map((row) => row.sourceFingerprint === sourceFingerprint ? { ...row, selected: !row.selected } : row);
    this.state.selectedMissingCount = this.state.missing.filter((row) => row.selected).length;
  }

  confirmSelectedMissing(): Promise<boolean> {
    if (this.confirmMissingInFlight) return Promise.resolve(false);
    const selected = this.state.missing.filter((row) => row.selected).map((row) => ({ ...row, candidates: [...row.candidates] }));
    if (!selected.length) return Promise.resolve(this.reject('请先选择需要补录的账目'));
    if (!this.content || !this.api.confirmDraft) return Promise.resolve(this.reject('补录接口暂不可用'));
    const content = typeof this.content === 'string' ? this.content : new Uint8Array(this.content);
    const selectedFingerprints = new Set(selected.map((row) => row.sourceFingerprint));
    const revision = this.selectionRevision;
    this.state.loading = true;
    this.state.error = '';
    const pending = this.confirmMissing(selected, content, selectedFingerprints, revision);
    this.confirmMissingInFlight = pending;
    pending.then(() => {
      if (this.confirmMissingInFlight === pending) this.confirmMissingInFlight = null;
    }, () => {
      if (this.confirmMissingInFlight === pending) this.confirmMissingInFlight = null;
    });
    return pending;
  }

  private async confirmMissing(selected: ReconcileRow[], content: FileContent, selectedFingerprints: Set<string>, revision: number): Promise<boolean> {
    try {
      const baseHash = await this.hashFile(content);
      for (const row of selected) {
        const result = await this.api.stageImport({
          fileHash: `${baseHash}:${row.sourceFingerprint}`,
          sourceType: 'anz-csv',
          draft: { amountMinor: row.amountMinor, direction: row.direction, occurredAt: row.date, merchant: row.merchant, sourceFingerprint: row.sourceFingerprint },
        });
        const draftId = result.draft?.id ?? result.draftId;
        if (!draftId) throw new Error('未能生成待确认草稿');
        await this.api.confirmDraft!(draftId, {});
      }
      if (revision !== this.selectionRevision) return true;
      this.state.confirmedMissingCount = selected.length;
      this.state.missing = this.state.missing.filter((row) => !selectedFingerprints.has(row.sourceFingerprint));
      this.state.selectedMissingCount = this.state.missing.filter((row) => row.selected).length;
      return true;
    } catch (error) {
      if (revision === this.selectionRevision) this.state.error = error instanceof Error ? error.message : '补录失败，请稍后重试';
      return false;
    } finally {
      if (revision === this.selectionRevision) this.state.loading = false;
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
    const revision = this.selectionRevision;
    const key = `${revision}:${sourceFingerprint}`;
    if (this.duplicateInFlight.has(key)) return false;
    const snapshot: DuplicateSnapshot = {
      row: { ...row, candidates: [...row.candidates] },
      content: typeof this.content === 'string' ? this.content : new Uint8Array(this.content),
      revision,
    };
    this.state.loading = true;
    this.state.error = '';
    const pending = this.confirmDuplicate(snapshot);
    this.duplicateInFlight.set(key, pending);
    pending.then(() => {
      if (this.duplicateInFlight.get(key) === pending) this.duplicateInFlight.delete(key);
      if (!this.duplicateInFlight.size && this.isCurrent(revision)) this.state.loading = false;
    }, () => {
      if (this.duplicateInFlight.get(key) === pending) this.duplicateInFlight.delete(key);
      if (!this.duplicateInFlight.size && this.isCurrent(revision)) this.state.loading = false;
    });
    return pending;
  }

  private async confirmDuplicate(snapshot: DuplicateSnapshot): Promise<boolean> {
    try {
      const baseHash = await this.hashFile(snapshot.content);
      const result = await this.api.stageImport({ fileHash: `${baseHash}:${snapshot.row.sourceFingerprint}:keep`, sourceType: 'anz-csv', draft: snapshot.row });
      const draftId = result.draft?.id ?? result.draftId;
      if (!draftId) throw new Error('未能生成待确认草稿');
      await this.api.confirmDraft!(draftId, { allowDuplicate: true });
      if (this.isCurrent(snapshot.revision)) {
        const currentRow = this.state.duplicates.find((item) => item.sourceFingerprint === snapshot.row.sourceFingerprint);
        if (currentRow) currentRow.resolution = 'keep-both';
      }
      return true;
    } catch (error) {
      if (this.isCurrent(snapshot.revision)) this.state.error = error instanceof Error ? error.message : '重复项处理失败';
      return false;
    }
  }

  async parseText(input: string): Promise<boolean> {
    const revision = this.beginSelection();
    const value = input.trim();
    if (!value) return this.reject('请输入一笔账目描述', revision);
    try {
      const preview = await this.api.parseDraft(value);
      if (revision !== this.selectionRevision) return false;
      this.state.preview = preview;
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
      if (this.isCurrent(revision)) {
        this.state.originalPreserved = true;
        this.state.error = error instanceof Error ? error.message : 'AI 解析失败，请手工录入';
      }
      return false;
    } finally {
      if (this.isCurrent(revision)) this.state.loading = false;
    }
  }

  async stage(): Promise<boolean> {
    const snapshot = this.createStageSnapshot();
    if (!snapshot) return this.reject('请先选择文件或输入账目描述');
    this.state.loading = true;
    this.state.error = '';
    const fileHash = await this.hashFile(snapshot.content);
    const key = this.stageKey(fileHash);
    const existing = this.stageInFlight.get(key);
    const pending = existing ?? this.runStage(snapshot, fileHash, key);
    if (!existing) this.stageInFlight.set(key, pending);
    try {
      const outcome = await pending;
      if (this.isCurrentSnapshot(snapshot)) {
        if (outcome.result) this.state.stageResult = outcome.result;
        if (outcome.ok && outcome.result) {
          this.state.uploaded = this.uploadCompleted.has(key);
          this.state.error = '';
        } else {
          this.state.originalPreserved = true;
          this.state.error = outcome.error ?? '文件处理失败，请重试';
        }
        this.state.loading = false;
      }
      return outcome.ok;
    } finally {
      if (this.stageInFlight.get(key) === pending) this.stageInFlight.delete(key);
    }
  }

  private async runStage(snapshot: StageSnapshot, fileHash: string, key: string): Promise<StageOutcome> {
    let result: StageResult | undefined;
    try {
      const previous = this.staged.get(key);
      result = previous ?? (snapshot.sourceType === 'anz-csv'
        ? await this.api.stageAnzCsv({ fileHash, csv: asText(snapshot.content) })
        : await this.api.stageImport({ fileHash, sourceType: snapshot.sourceType, draft: snapshot.preview ?? undefined }));
      this.staged.set(key, result);
      await this.completeOriginalUpload(snapshot, key, result);
      return { ok: true, result };
    } catch (error) {
      return { ok: false, result, error: error instanceof Error ? error.message : '文件处理失败，请重试' };
    }
  }

  private async completeOriginalUpload(snapshot: StageSnapshot, key: string, result: StageResult): Promise<void> {
    const file = snapshot.file;
    const draftId = result.draft?.id ?? result.draftId;
    if (snapshot.sourceType === 'anz-csv' || !file || !this.api.uploadAttachment || !draftId) return;
    if (this.uploadCompleted.has(key)) return;
    await this.api.uploadAttachment({ filePath: file.path, draftId, originalName: file.name, contentType: file.contentType });
    this.uploadCompleted.add(key);
  }

  private async select(filePromise: Promise<PickedImportFile>, sourceType: ImportSourceType, revision: number): Promise<boolean> {
    try {
      const file = await filePromise;
      if (!this.isCurrent(revision)) return false;
      if (file.size > MAX_IMPORT_BYTES) return this.reject('文件不能超过 20 MB');
      const content = file.bytes ?? file.text ?? await this.picker.readFile(file.path);
      if (!this.isCurrent(revision)) return false;
      const selectedContent = content instanceof ArrayBuffer ? new Uint8Array(content) : content;
      if (!signatureMatches(file, selectedContent)) return this.reject('文件类型与内容签名不匹配', revision);
      if (!this.isCurrent(revision)) return false;
      this.content = selectedContent;
      this.state.file = file;
      this.state.sourceType = sourceType;
      this.state.preview = null;
      this.state.previewAmountDisplay = '';
      this.state.rows = [];
      this.state.stageResult = null;
      this.state.uploaded = false;
      this.state.originalPreserved = true;
      this.state.textInput = '';
      this.state.matched = [];
      this.state.duplicates = [];
      this.state.missing = [];
      this.state.selectedMissingCount = 0;
      let rows: ImportedRow[] = [];
      let preview: DocumentDraft | null = null;
      if (sourceType === 'anz-csv') {
        rows = await this.api.previewAnzCsv(asText(selectedContent));
        if (!this.isCurrent(revision)) return false;
      }
      else {
        preview = await this.api.previewDocument({ filePath: file.path, fileName: file.name, contentType: file.contentType });
        if (!this.isCurrent(revision)) return false;
      }
      const mode = this.state.mode;
      if (mode === 'statement') {
        if (!rows.length && preview) {
          rows = [{
            date: preview.occurredAt ?? new Date().toISOString().slice(0, 10),
            amountMinor: preview.amountMinor,
            direction: preview.direction,
            merchant: preview.merchant,
            sourceFingerprint: `${file.name}:0`,
          }];
        }
        const classified = await this.analyzeStatement(rows, revision);
        if (!classified || !this.isCurrent(revision)) return false;
        this.state.rows = rows;
        this.state.preview = preview;
        this.state.previewAmountDisplay = preview ? formatNzdMinor(preview.amountMinor) : '';
        this.state.matched = classified.matched;
        this.state.duplicates = classified.duplicates;
        this.state.missing = classified.missing;
        this.state.selectedMissingCount = classified.missing.length;
        this.state.view = 'results';
      } else {
        if (!this.isCurrent(revision)) return false;
        this.state.rows = rows;
        this.state.preview = preview;
        this.state.previewAmountDisplay = preview ? formatNzdMinor(preview.amountMinor) : '';
      }
      return true;
    } catch (error) {
      if (this.isCurrent(revision)) {
        this.state.error = error instanceof Error ? error.message : '文件处理失败，请重试';
        this.state.originalPreserved = true;
      }
      return false;
    } finally {
      if (this.isCurrent(revision)) this.state.loading = false;
    }
  }

  private reject(message: string, revision?: number): false {
    if (revision === undefined || this.isCurrent(revision)) {
      this.state.error = message;
      this.state.loading = false;
    }
    return false;
  }

  private beginSelection(): number {
    this.selectionRevision += 1;
    this.state.loading = true;
    this.state.view = this.state.mode === 'statement' ? 'analyzing' : 'preview';
    this.state.error = '';
    return this.selectionRevision;
  }

  private isCurrent(revision: number): boolean { return revision === this.selectionRevision; }

  private createStageSnapshot(): StageSnapshot | null {
    if (!this.content || !this.state.sourceType) return null;
    return {
      content: typeof this.content === 'string' ? this.content : new Uint8Array(this.content),
      file: this.state.file ? { ...this.state.file, ...(this.state.file.bytes ? { bytes: new Uint8Array(this.state.file.bytes) } : {}) } : null,
      sourceType: this.state.sourceType,
      preview: this.state.preview ? { ...this.state.preview } : null,
      revision: this.selectionRevision,
    };
  }

  private stageKey(fileHash: string): string { return fileHash; }

  private isCurrentSnapshot(snapshot: StageSnapshot): boolean { return this.isCurrent(snapshot.revision); }

  private async analyzeStatement(rows: ImportedRow[], revision: number): Promise<{ matched: ReconcileRow[]; duplicates: ReconcileRow[]; missing: ReconcileRow[] } | null> {
    const classified = await Promise.all(rows.map(async (row): Promise<{ row: ReconcileRow; kind: 'matched' | 'duplicate' | 'missing' } | null> => {
      const candidates = this.api.previewDuplicates ? await this.api.previewDuplicates({
        id: row.sourceFingerprint,
        amountMinor: row.amountMinor,
        direction: row.direction,
        occurredAt: /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? `${row.date}T00:00:00.000Z` : row.date,
        merchant: row.merchant,
        sourceFingerprint: row.sourceFingerprint,
      }) : [];
      if (!this.isCurrent(revision)) return null;
      const item: ReconcileRow = { ...row, amountDisplay: `${row.direction === 'expense' ? '−' : '+'} ${formatNzdMinor(row.amountMinor)}`, selected: candidates.length === 0, candidates };
      return { row: item, kind: candidates.some((candidate) => candidate.score >= 95) ? 'matched' : candidates.length ? 'duplicate' : 'missing' };
    }));
    if (!this.isCurrent(revision) || classified.some((item) => !item)) return null;
    const complete = classified as Array<{ row: ReconcileRow; kind: 'matched' | 'duplicate' | 'missing' }>;
    return {
      matched: complete.filter((item) => item.kind === 'matched').map((item) => item.row),
      duplicates: complete.filter((item) => item.kind === 'duplicate').map((item) => item.row),
      missing: complete.filter((item) => item.kind === 'missing').map((item) => item.row),
    };
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
    confirmSelectedMissing(this: PageContext) {
      const pending = model.confirmSelectedMissing();
      this.setData(model.state);
      return pending.then(() => { this.setData(model.state); });
    },
    resolveDuplicate(this: PageContext, event: { currentTarget?: { dataset?: { id?: string; action?: string } } }) {
      const action = event.currentTarget?.dataset?.action;
      if (action !== 'later' && action !== 'keep-both') return;
      const pending = model.resolveDuplicate(event.currentTarget?.dataset?.id ?? '', action);
      this.setData(model.state);
      return pending.then(() => { this.setData(model.state); });
    },
  };
}

declare function Page(options: Record<string, unknown>): void;
declare function getApp<T>(): unknown;
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
  const runtime = getRuntime();
  Page(withThemePage(createImportPage(new ImportPageModel(createImportPicker(), runtime.api as unknown as ImportApiPort)), runtime.theme));
}
