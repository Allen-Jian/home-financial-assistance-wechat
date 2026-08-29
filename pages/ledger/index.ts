import { ApiError } from '../../src/api/client';
import { parseNzdMinor } from '../../src/domain/money';
import type { AccountSummary, CategorySummary } from '../../src/api/contracts';
import { getRuntime } from '../../app';

export type LedgerDirection = 'income' | 'expense' | 'transfer' | 'adjustment';
export type DuplicateAction = 'later' | 'keep-both';
export interface LedgerApiPort {
  createTransaction(input: Record<string, unknown>): Promise<unknown>;
  fetchAccounts?: () => Promise<AccountSummary[]>;
  fetchCategories?: () => Promise<CategorySummary[]>;
}
export interface LedgerState {
  direction: LedgerDirection;
  amount: string;
  accountId: string;
  categoryId: string;
  occurredAt: string;
  note: string;
  error: string;
  saved: boolean;
  duplicateDetails: unknown;
  duplicateActions: ['稍后处理', '保留两笔'] | [];
  accounts: AccountSummary[];
  categories: CategorySummary[];
  accountName: string;
  categoryName: string;
}

const makeIdempotencyKey = () => `mini-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export class LedgerPageModel {
  state: LedgerState = {
    direction: 'expense', amount: '', accountId: '', categoryId: '',
    occurredAt: new Date().toISOString().slice(0, 10), note: '', error: '', saved: false,
    duplicateDetails: null, duplicateActions: [], accounts: [], categories: [], accountName: '', categoryName: '',
  };
  private pendingPayload: Record<string, unknown> | null = null;

  constructor(private readonly api: LedgerApiPort, private readonly idFactory: () => string = makeIdempotencyKey) {}

  setDirection(value: LedgerDirection): void { this.state.direction = value; }
  setAmount(value: string): void { this.state.amount = value; }
  setAccount(value: string): void { this.state.accountId = value; }
  setCategory(value: string): void { this.state.categoryId = value; }
  setDate(value: string): void { this.state.occurredAt = value; }
  setNote(value: string): void { this.state.note = value; }
  setAccounts(accounts: AccountSummary[]): void { this.state.accounts = accounts; }
  setCategories(categories: CategorySummary[]): void { this.state.categories = categories; }
  setAccountByIndex(index: number): void {
    const account = this.state.accounts[index];
    if (account) { this.state.accountId = account.id; this.state.accountName = account.name; }
  }
  setCategoryByIndex(index: number): void {
    const category = this.state.categories[index];
    if (category) { this.state.categoryId = category.id; this.state.categoryName = category.name; }
  }
  async load(): Promise<void> {
    const [accounts, categories] = await Promise.all([
      this.api.fetchAccounts?.() ?? Promise.resolve([]),
      this.api.fetchCategories?.() ?? Promise.resolve([]),
    ]);
    this.setAccounts(accounts);
    this.setCategories(categories);
  }

  async submit(): Promise<boolean> {
    this.state.error = '';
    this.state.saved = false;
    let amountMinor: number;
    try { amountMinor = parseNzdMinor(this.state.amount); } catch { this.state.error = '请输入有效金额'; return false; }
    if (amountMinor <= 0) { this.state.error = '金额必须大于 0'; return false; }
    if (!this.state.accountId) { this.state.error = '请选择账户'; return false; }
    const occurredAt = new Date(`${this.state.occurredAt}T00:00:00.000Z`);
    if (Number.isNaN(occurredAt.valueOf())) { this.state.error = '请选择有效日期'; return false; }
    const payload: Record<string, unknown> = {
      direction: this.state.direction, amountMinor, accountId: this.state.accountId,
      occurredAt: occurredAt.toISOString(), idempotencyKey: this.idFactory(),
    };
    if (this.state.categoryId) payload.categoryId = this.state.categoryId;
    if (this.state.note.trim()) payload.note = this.state.note.trim();
    return this.send(payload);
  }

  async chooseDuplicate(action: DuplicateAction): Promise<boolean> {
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
    try {
      await this.api.createTransaction(payload);
      this.state.saved = true;
      this.state.duplicateDetails = null;
      this.state.duplicateActions = [];
      this.pendingPayload = null;
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 409) {
        this.pendingPayload = payload;
        this.state.duplicateDetails = error.details;
        this.state.duplicateActions = ['稍后处理', '保留两笔'];
        this.state.error = '发现可能重复，请选择处理方式';
        return false;
      }
      this.state.error = error instanceof Error ? error.message : '保存失败，请稍后重试';
      return false;
    }
  }
}

interface PageContext { setData(data: unknown): void }

export function createLedgerPage(model: LedgerPageModel) {
  return {
    data: model.state,
    onDirectionChange(this: PageContext, event: { currentTarget?: { dataset?: { value?: string } } }) {
      const direction = event.currentTarget?.dataset?.value;
      if (direction === 'income' || direction === 'expense' || direction === 'transfer') model.setDirection(direction);
      this.setData(model.state);
    },
    onAmountInput(this: PageContext, event: { detail?: { value?: string } }) { model.setAmount(event.detail?.value ?? ''); this.setData(model.state); },
    onAccountChange(this: PageContext, event: { detail?: { value?: number } }) { model.setAccountByIndex(Number(event.detail?.value ?? -1)); this.setData(model.state); },
    onCategoryChange(this: PageContext, event: { detail?: { value?: number } }) { model.setCategoryByIndex(Number(event.detail?.value ?? -1)); this.setData(model.state); },
    onDateChange(this: PageContext, event: { detail?: { value?: string } }) { model.setDate(event.detail?.value ?? ''); this.setData(model.state); },
    onNoteInput(this: PageContext, event: { detail?: { value?: string } }) { model.setNote(event.detail?.value ?? ''); this.setData(model.state); },
    setAccounts(accounts: AccountSummary[]) { model.setAccounts(accounts); },
    async onLoad(this: PageContext) { await model.load(); this.setData(model.state); },
    async save(this: PageContext) { await model.submit(); this.setData(model.state); },
    async later(this: PageContext) { await model.chooseDuplicate('later'); this.setData(model.state); },
    async keepBoth(this: PageContext) { await model.chooseDuplicate('keep-both'); this.setData(model.state); },
  };
}

declare function Page(options: Record<string, unknown>): void;
declare function getApp<T>(): T;
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
  const runtime = getRuntime();
  Page(createLedgerPage(new LedgerPageModel(runtime.api as unknown as LedgerApiPort)));
}
