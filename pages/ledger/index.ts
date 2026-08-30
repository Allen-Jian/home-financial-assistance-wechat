import { ApiError } from '../../src/api/client';
import { formatNzdMinor, parseNzdMinor } from '../../src/domain/money';
import { ReadCache } from '../../src/cache/read-cache';
import type { AccountSummary, CategorySummary } from '../../src/api/contracts';
import type { TransactionSummary } from '../../src/api/contracts';
import { getRuntime } from '../../app';
import { getPeriodBounds } from '../../src/domain/period';

export type LedgerPeriodMode = 'month' | 'year' | 'custom';
export interface LedgerPeriodQuery { from: string; to: string }
export interface LedgerListItem extends TransactionSummary {
  amountDisplay: string;
  dateDisplay: string;
  directionLabel: string;
}
export interface LedgerListApiPort {
  fetchTransactions(period: LedgerPeriodQuery): Promise<TransactionSummary[]>;
}
export interface LedgerListState {
  periodMode: LedgerPeriodMode;
  period: LedgerPeriodQuery;
  customFrom: string;
  customTo: string;
  transactions: LedgerListItem[];
  selectedTransaction: TransactionSummary | null;
  selectedAmountDisplay: string;
  selectedDateDisplay: string;
  selectedDirectionLabel: string;
  loading: boolean;
  error: string;
}

const directionLabels: Record<TransactionSummary['direction'], string> = {
  income: '收入', expense: '支出', transfer: '转账', adjustment: '调整',
};

function currentAucklandDate(): Date { return new Date(); }

function aucklandBoundary(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(value);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const year = read('year');
  const month = read('month');
  const day = read('day');
  const hour = read('hour') === 24 ? 0 : read('hour');
  const minute = read('minute');
  const second = read('second');
  const localTimestamp = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMinutes = Math.round((localTimestamp - value.valueOf()) / 60_000);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(absoluteOffset / 60)).padStart(2, '0')}:${String(absoluteOffset % 60).padStart(2, '0')}`;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}${offset}`;
}

function customBoundary(value: string, end = false): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [year, month, day] = match.slice(1).map(Number);
  const target = Date.UTC(year, month - 1, day + (end ? 1 : 0));
  let guess = target;
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = formatter.formatToParts(new Date(guess));
    const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const observed = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour') === 24 ? 0 : read('hour'), read('minute'), read('second'));
    const next = target - (observed - guess);
    if (next === guess) return new Date(next).toISOString();
    guess = next;
  }
  return new Date(guess).toISOString();
}

function toDisplayDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export class LedgerListPageModel {
  state: LedgerListState = {
    periodMode: 'month', period: { from: '', to: '' }, customFrom: '', customTo: '',
    transactions: [], selectedTransaction: null, selectedAmountDisplay: '', selectedDateDisplay: '', selectedDirectionLabel: '', loading: false, error: '',
  };

  constructor(private readonly api: LedgerListApiPort, private readonly now: () => Date = currentAucklandDate, private readonly cache?: ReadCache, private readonly householdId: () => string = () => 'anonymous') {
    const period = this.currentPeriod();
    this.state.period = period;
  }

  currentPeriod(): LedgerPeriodQuery {
    if (this.state.periodMode === 'custom' && this.state.customFrom && this.state.customTo) {
      return { from: customBoundary(this.state.customFrom), to: customBoundary(this.state.customTo, true) };
    }
    const kind = this.state.periodMode === 'year' ? 'year' : 'month';
    const bounds = getPeriodBounds(this.now(), kind);
    return { from: aucklandBoundary(bounds.from), to: aucklandBoundary(bounds.to) };
  }

  setPeriod(mode: LedgerPeriodMode, from?: string, to?: string): void {
    this.state.periodMode = mode;
    if (mode === 'custom') {
      this.state.customFrom = from ?? this.state.customFrom;
      this.state.customTo = to ?? this.state.customTo;
      if (this.state.customFrom && this.state.customTo) this.state.period = { from: this.state.customFrom, to: this.state.customTo };
      return;
    }
    this.state.period = this.currentPeriod();
  }

  async load(period: LedgerPeriodQuery): Promise<boolean> {
    this.state.period = period;
    const scope = this.householdId();
    const cacheKey = this.cacheKey(period, scope);
    this.state.loading = true;
    this.state.error = '';
    this.state.selectedTransaction = null;
    try {
      const transactions = await this.api.fetchTransactions(period);
      if (scope !== this.householdId()) return false;
      this.cache?.set(cacheKey, transactions);
      this.state.transactions = transactions.map((transaction) => ({
        ...transaction,
        amountDisplay: formatNzdMinor(transaction.amountMinor),
        dateDisplay: toDisplayDate(transaction.occurredAt),
        directionLabel: directionLabels[transaction.direction],
      }));
      return true;
    } catch (error) {
      const cached = scope === this.householdId() && error instanceof ApiError && (error.code === 'network' || error.code === 'timeout')
        ? this.cache?.read<TransactionSummary[]>(cacheKey, 5 * 60_000)
        : null;
      if (cached) this.state.transactions = cached.data.map((transaction) => ({ ...transaction, amountDisplay: formatNzdMinor(transaction.amountMinor), dateDisplay: toDisplayDate(transaction.occurredAt), directionLabel: directionLabels[transaction.direction] }));
      else this.state.error = error instanceof Error ? error.message : '加载账目失败';
      return false;
    } finally {
      this.state.loading = false;
    }
  }

  selectTransaction(id: string): void {
    const selected = this.state.transactions.find((transaction) => transaction.id === id);
    if (!selected) { this.state.selectedTransaction = null; return; }
    const { amountDisplay: _amountDisplay, dateDisplay: _dateDisplay, directionLabel: _directionLabel, ...transaction } = selected;
    this.state.selectedTransaction = transaction;
    this.state.selectedAmountDisplay = selected.amountDisplay;
    this.state.selectedDateDisplay = selected.dateDisplay;
    this.state.selectedDirectionLabel = selected.directionLabel;
  }

  setCustomFrom(value: string): void { this.state.customFrom = value; }
  setCustomTo(value: string): void { this.state.customTo = value; }

  private cacheKey(period: LedgerPeriodQuery, scope = this.householdId()): string { return `ledger:${scope}:${period.from}:${period.to}`; }

  shiftMonth(delta: number): LedgerPeriodQuery {
    const current = this.state.periodMode === 'month' ? this.state.period.from : this.currentPeriod().from;
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(current));
    const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 1);
    const date = new Date(Date.UTC(read('year'), read('month') - 1 + delta, 1));
    const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
    const isoDay = (value: Date) => `${value.getUTCFullYear().toString().padStart(4, '0')}-${(value.getUTCMonth() + 1).toString().padStart(2, '0')}-${value.getUTCDate().toString().padStart(2, '0')}`;
    this.state.periodMode = 'month';
    this.state.period = { from: customBoundary(isoDay(date)), to: customBoundary(isoDay(next)) };
    return this.state.period;
  }
}

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
    openImports() { wx.navigateTo({ url: '/pages/imports/index' }); },
    async onLoad(this: PageContext) { await model.load(); this.setData(model.state); },
    async save(this: PageContext) { await model.submit(); this.setData(model.state); },
    async later(this: PageContext) { await model.chooseDuplicate('later'); this.setData(model.state); },
    async keepBoth(this: PageContext) { await model.chooseDuplicate('keep-both'); this.setData(model.state); },
  };
}

export function createLedgerListPage(model: LedgerListPageModel) {
  return {
    data: model.state,
    async onShow(this: PageContext) {
      await model.load(model.currentPeriod());
      this.setData(model.state);
    },
    async changePeriod(this: PageContext, event: { currentTarget?: { dataset?: { mode?: string } } }) {
      const mode = event.currentTarget?.dataset?.mode;
      if (mode === 'month' || mode === 'year') {
        model.setPeriod(mode);
        await model.load(model.currentPeriod());
      } else if (mode === 'custom') {
        model.setPeriod('custom');
      }
      this.setData(model.state);
    },
    async changeMonth(this: PageContext, event: { currentTarget?: { dataset?: { delta?: string } } }) {
      const period = model.shiftMonth(Number(event.currentTarget?.dataset?.delta ?? 0));
      await model.load(period);
      this.setData(model.state);
    },
    async applyCustomPeriod(this: PageContext) {
      if (!model.state.customFrom || !model.state.customTo) {
        model.state.error = '请选择完整的起止日期';
      } else if (model.state.customFrom > model.state.customTo) {
        model.state.error = '开始日期不能晚于结束日期';
      } else {
        model.setPeriod('custom', model.state.customFrom, model.state.customTo);
        await model.load(model.currentPeriod());
      }
      this.setData(model.state);
    },
    onCustomFrom(this: PageContext, event: { detail?: { value?: string } }) {
      model.setCustomFrom(event.detail?.value ?? '');
      this.setData(model.state);
    },
    onCustomTo(this: PageContext, event: { detail?: { value?: string } }) {
      model.setCustomTo(event.detail?.value ?? '');
      this.setData(model.state);
    },
    openDetail(this: PageContext, event: { currentTarget?: { dataset?: { id?: string } } }) {
      model.selectTransaction(event.currentTarget?.dataset?.id ?? '');
      this.setData(model.state);
    },
    closeDetail(this: PageContext) {
      model.state.selectedTransaction = null;
      model.state.selectedAmountDisplay = '';
      model.state.selectedDateDisplay = '';
      model.state.selectedDirectionLabel = '';
      this.setData(model.state);
    },
  };
}

declare function Page(options: Record<string, unknown>): void;
declare function getApp<T>(): T;
declare const wx: { navigateTo(options: { url: string }): void };
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
  const runtime = getRuntime();
  Page(createLedgerListPage(new LedgerListPageModel(runtime.api as unknown as LedgerListApiPort, undefined, runtime.cache, () => runtime.sessions.read()?.householdId ?? 'anonymous')));
}
