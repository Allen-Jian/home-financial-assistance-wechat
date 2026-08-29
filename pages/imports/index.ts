import type { DocumentDraft, ImportedRow, StageResult } from '../../src/api/contracts';
import { getRuntime } from '../../app';

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
}

export interface ImportPageState {
  file: PickedImportFile | null;
  sourceType: ImportSourceType | null;
  preview: DocumentDraft | null;
  rows: ImportedRow[];
  stageResult: StageResult | null;
  uploaded: boolean;
  originalPreserved: boolean;
  loading: boolean;
  error: string;
  textInput: string;
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
      count: 1, mediaType: ['image'], sourceType: ['camera', 'album'],
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
    file: null, sourceType: null, preview: null, rows: [], stageResult: null, uploaded: false,
    originalPreserved: false, loading: false, error: '', textInput: '',
  };
  private content: FileContent | null = null;
  private readonly staged = new Map<string, StageResult>();

  constructor(
    private readonly picker: ImportPickerPort,
    private readonly api: ImportApiPort,
    private readonly hashFile: (content: FileContent) => string | Promise<string> = simpleHash,
  ) {}

  choosePhoto(): Promise<boolean> { return this.select(this.picker.chooseMedia(), 'manual-photo'); }

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

  async parseText(input: string): Promise<boolean> {
    const value = input.trim();
    if (!value) return this.reject('请输入一笔账目描述');
    this.state.loading = true;
    this.state.error = '';
    try {
      this.state.preview = await this.api.parseDraft(value);
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
      if (!result.reused && file) {
        await this.api.uploadAttachment({ filePath: file.path, draftId: result.draftId ?? result.batchId, originalName: file.name, contentType: file.contentType });
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
      this.state.rows = [];
      this.state.stageResult = null;
      this.state.uploaded = false;
      this.state.originalPreserved = true;
      this.state.textInput = '';
      if (sourceType === 'anz-csv') this.state.rows = await this.api.previewAnzCsv(asText(this.content));
      else this.state.preview = await this.api.previewDocument({ filePath: file.path, fileName: file.name, contentType: file.contentType });
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
}

export function createImportPage(model: ImportPageModel) {
  return {
    data: model.state,
    async choosePhoto(this: PageContext) { await model.choosePhoto(); this.setData(model.state); },
    async chooseFile(this: PageContext) { await model.chooseFile(); this.setData(model.state); },
    async chooseCsv(this: PageContext) { await model.chooseCsv(); this.setData(model.state); },
    async parseText(this: PageContext, event: { detail?: { value?: string } }) { await model.parseText(event.detail?.value ?? ''); this.setData(model.state); },
    async stage(this: PageContext) { await model.stage(); this.setData(model.state); },
  };
}

declare function Page(options: Record<string, unknown>): void;
declare function getApp<T>(): unknown;
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
  const runtime = getRuntime();
  Page(createImportPage(new ImportPageModel(createImportPicker(), runtime.api as unknown as ImportApiPort)));
}
