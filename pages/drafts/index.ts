import type { DraftSummary } from '../../src/api/contracts';
import { ApiError } from '../../src/api/client';
import { getRuntime } from '../../app';
import { formatNzdMinor } from '../../src/domain/money';
import { withThemePage } from '../../src/shared/themed-page';

export type DraftDuplicateAction = 'later' | 'keep-both';
export interface DraftApiPort {
  fetchPendingDrafts(): Promise<DraftSummary[]>;
  confirmDraft(draftId: string, input: Record<string, unknown>): Promise<unknown>;
}

export interface DraftReviewState {
  drafts: DraftSummary[];
  index: number;
  current: DraftSummary | null;
  editing: boolean;
  loading: boolean;
  error: string;
  duplicateDetails: unknown;
  duplicateActions: ['稍后处理', '保留两笔'] | [];
  currentAmountDisplay: string;
}

export class DraftReviewPageModel {
  state: DraftReviewState = {
    drafts: [], index: 0, current: null, editing: false, loading: false,
    error: '', duplicateDetails: null, duplicateActions: [], currentAmountDisplay: '',
  };

  constructor(private readonly api: DraftApiPort) {}

  async load(): Promise<void> {
    this.state.loading = true;
    this.state.error = '';
    try {
      this.state.drafts = await this.api.fetchPendingDrafts();
      this.state.index = 0;
      this.syncCurrent();
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : '加载草稿失败';
    } finally {
      this.state.loading = false;
    }
  }

  setEditing(editing: boolean): void { this.state.editing = editing; }

  async confirm(): Promise<boolean> {
    if (!this.state.current) return false;
    return this.send({});
  }

  async chooseDuplicate(action: DraftDuplicateAction): Promise<boolean> {
    if (action === 'later') {
      this.state.duplicateDetails = null;
      this.state.duplicateActions = [];
      this.state.error = '已保留草稿，稍后可继续处理';
      return false;
    }
    if (!this.state.current) return false;
    return this.send({ allowDuplicate: true });
  }

  private async send(input: Record<string, unknown>): Promise<boolean> {
    const draft = this.state.current;
    if (!draft) return false;
    try {
      await this.api.confirmDraft(draft.id, input);
      this.state.drafts = this.state.drafts.filter((item) => item.id !== draft.id);
      this.state.index = Math.min(this.state.index, Math.max(this.state.drafts.length - 1, 0));
      this.state.duplicateDetails = null;
      this.state.duplicateActions = [];
      this.state.error = '';
      this.syncCurrent();
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 409) {
        this.state.duplicateDetails = error.details;
        this.state.duplicateActions = ['稍后处理', '保留两笔'];
        this.state.error = '发现可能重复，请选择处理方式';
        return false;
      }
      this.state.error = error instanceof Error ? error.message : '确认草稿失败';
      return false;
    }
  }

  private syncCurrent(): void {
    this.state.current = this.state.drafts[this.state.index] ?? null;
    this.state.currentAmountDisplay = this.state.current ? formatNzdMinor(this.state.current.amountMinor) : '';
  }
}

interface PageContext { setData(data: unknown): void }

export function createDraftsPage(model: DraftReviewPageModel) {
  return {
    data: model.state,
    async onShow(this: PageContext) { await model.load(); this.setData(model.state); },
    onEdit(this: PageContext) { model.setEditing(true); this.setData(model.state); },
    async confirm(this: PageContext) { await model.confirm(); this.setData(model.state); },
    async later(this: PageContext) { await model.chooseDuplicate('later'); this.setData(model.state); },
    async keepBoth(this: PageContext) { await model.chooseDuplicate('keep-both'); this.setData(model.state); },
  };
}

declare function Page(options: Record<string, unknown>): void;
declare function getApp<T>(): unknown;
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
  const runtime = getRuntime();
  Page(withThemePage(createDraftsPage(new DraftReviewPageModel(runtime.api as unknown as DraftApiPort)), runtime.theme));
}
