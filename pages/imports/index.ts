import type { DocumentDraft, ImportedRow, StageResult } from '../../src/api/contracts';

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export type ImportSourceType = 'manual-photo' | 'pdf' | 'anz-csv';
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
    originalPreserved: false, loading: false, error: '',
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

  async stage(): Promise<boolean> {
    const file = this.state.file;
    if (!file || !this.content || !this.state.sourceType) return this.reject('请先选择文件');
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
      if (!result.reused) {
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

declare function Page(options: Record<string, unknown>): void;
if (typeof Page !== 'undefined') {
  Page({ data: { file: null, sourceType: '', preview: null, rows: [], stageResult: null, uploaded: false, originalPreserved: false, loading: false, error: '' } });
}
