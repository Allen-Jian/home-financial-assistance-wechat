import { ApiError } from '../../../src/api/client';
import { parseNzdMinor } from '../../../src/domain/money';
import type { CategorySummary, Direction } from '../../../src/api/contracts';
import { getRuntime } from '../../../app';
import { withThemePage } from '../../../src/shared/themed-page';

export interface ManualEntryApiPort {
  createTransaction(input: Record<string, unknown>): Promise<unknown>;
  fetchCategories?: () => Promise<CategorySummary[]>;
}

export interface ManualEntryState {
  direction: 'income' | 'expense';
  amount: string;
  categoryId: string;
  categoryName: string;
  occurredAt: string;
  note: string;
  merchant: string;
  categories: CategorySummary[];
  visibleCategories: CategorySummary[];
  loading: boolean;
  saved: boolean;
  error: string;
  duplicateDetails: unknown;
  duplicateActions: ['稍后处理', '保留两笔'] | [];
}

const makeIdempotencyKey = () => `mini-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export class ManualEntryPageModel {
  state: ManualEntryState = {
    direction: 'expense', amount: '', categoryId: '', categoryName: '',
    occurredAt: new Date().toISOString().slice(0, 10), note: '', merchant: '', categories: [], visibleCategories: [],
    loading: false, saved: false, error: '', duplicateDetails: null, duplicateActions: [],
  };
  private pendingPayload: Record<string, unknown> | null = null;

  constructor(private readonly api: ManualEntryApiPort, private readonly idFactory: () => string = makeIdempotencyKey) {}

  setDirection(direction: 'income' | 'expense'): void {
    this.state.direction = direction;
    this.refreshVisibleCategories();
    if (!this.state.visibleCategories.some((category) => category.id === this.state.categoryId)) {
      this.state.categoryId = '';
      this.state.categoryName = '';
    }
  }
  setAmount(amount: string): void { this.state.amount = amount; }
  setCategory(categoryId: string): void { this.state.categoryId = categoryId; }
  setCategoryByIndex(index: number): void {
    const category = this.state.categories[index];
    if (category) { this.state.categoryId = category.id; this.state.categoryName = category.name; }
  }
  setDate(occurredAt: string): void { this.state.occurredAt = occurredAt; }
  setNote(note: string): void { this.state.note = note; }
  setMerchant(merchant: string): void { this.state.merchant = merchant; }

  async load(): Promise<void> {
    if (!this.api.fetchCategories) return;
    this.state.loading = true;
    this.state.error = '';
    try {
      const categories = await this.api.fetchCategories();
      this.state.categories = categories.filter((category) => category.active !== false);
      this.refreshVisibleCategories();
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : '加载分类失败';
    } finally {
      this.state.loading = false;
    }
  }

  async submit(): Promise<boolean> {
    if (this.state.loading) return false;
    this.state.error = '';
    this.state.saved = false;
    let amountMinor: number;
    try { amountMinor = parseNzdMinor(this.state.amount); } catch { this.state.error = '请输入有效金额'; return false; }
    if (amountMinor <= 0) { this.state.error = '金额必须大于 0'; return false; }
    const occurredAt = new Date(`${this.state.occurredAt}T00:00:00.000Z`);
    if (Number.isNaN(occurredAt.valueOf())) { this.state.error = '请选择有效日期'; return false; }
    const payload: Record<string, unknown> = {
      direction: this.state.direction,
      amountMinor,
      occurredAt: occurredAt.toISOString(),
      idempotencyKey: this.idFactory(),
    };
    if (this.state.categoryId) payload.categoryId = this.state.categoryId;
    if (this.state.merchant.trim()) payload.merchant = this.state.merchant.trim();
    if (this.state.note.trim()) payload.note = this.state.note.trim();
    return this.send(payload);
  }

  private refreshVisibleCategories(): void {
    this.state.visibleCategories = this.state.categories.filter((category) => category.direction === this.state.direction);
  }

  async chooseDuplicate(action: 'later' | 'keep-both'): Promise<boolean> {
    if (action === 'later') {
      this.pendingPayload = null;
      this.state.duplicateDetails = null;
      this.state.duplicateActions = [];
      this.state.error = '已保留为待处理项';
      return false;
    }
    if (!this.pendingPayload) return false;
    return this.send({ ...this.pendingPayload, allowDuplicate: true });
  }

  private async send(payload: Record<string, unknown>): Promise<boolean> {
    this.state.loading = true;
    try {
      await this.api.createTransaction(payload);
      this.state.saved = true;
      this.pendingPayload = null;
      this.state.duplicateDetails = null;
      this.state.duplicateActions = [];
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 409) {
        this.pendingPayload = payload;
        this.state.duplicateDetails = error.details;
        this.state.duplicateActions = ['稍后处理', '保留两笔'];
        this.state.error = '发现可能重复，请选择处理方式';
      } else {
        this.state.error = error instanceof Error ? error.message : '保存失败，请稍后重试';
      }
      return false;
    } finally {
      this.state.loading = false;
    }
  }
}

interface PageContext { setData(data: unknown): void }

export function createManualEntryPage(model: ManualEntryPageModel) {
  return {
    data: model.state,
    close() { wx.navigateBack(); },
    async onLoad(this: PageContext) { await model.load(); this.setData(model.state); },
    onDirectionChange(this: PageContext, event: { currentTarget?: { dataset?: { value?: string } } }) {
      const direction = event.currentTarget?.dataset?.value;
      if (direction === 'income' || direction === 'expense') model.setDirection(direction);
      this.setData(model.state);
    },
    onAmountInput(this: PageContext, event: { detail?: { value?: string } }) { model.setAmount(event.detail?.value ?? ''); this.setData(model.state); },
    onMerchantInput(this: PageContext, event: { detail?: { value?: string } }) { model.setMerchant(event.detail?.value ?? ''); this.setData(model.state); },
    onCategoryChange(this: PageContext, event: { detail?: { value?: number } }) { model.setCategoryByIndex(Number(event.detail?.value ?? -1)); this.setData(model.state); },
    onCategoryTap(this: PageContext, event: { currentTarget?: { dataset?: { id?: string } } }) {
      const id = event.currentTarget?.dataset?.id ?? '';
      const category = model.state.visibleCategories.find((item) => item.id === id);
      if (category) { model.setCategory(category.id); model.state.categoryName = category.name; }
      this.setData(model.state);
    },
    onDateChange(this: PageContext, event: { detail?: { value?: string } }) { model.setDate(event.detail?.value ?? ''); this.setData(model.state); },
    onNoteInput(this: PageContext, event: { detail?: { value?: string } }) { model.setNote(event.detail?.value ?? ''); this.setData(model.state); },
    async save(this: PageContext) { await model.submit(); this.setData(model.state); },
    async later(this: PageContext) { await model.chooseDuplicate('later'); this.setData(model.state); },
    async keepBoth(this: PageContext) { await model.chooseDuplicate('keep-both'); this.setData(model.state); },
  };
}

declare function Page(options: Record<string, unknown>): void;
declare function getApp<T>(): T;
declare const wx: { navigateBack(): void };
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
  const runtime = getRuntime();
  Page(withThemePage(createManualEntryPage(new ManualEntryPageModel(runtime.api as unknown as ManualEntryApiPort)), runtime.theme));
}
