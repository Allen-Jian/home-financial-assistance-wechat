import type { RecurringSummary } from '../../src/api/contracts';
import { getRuntime } from '../../app';

export interface RecurringApiPort {
  fetchRecurring(): Promise<RecurringSummary[]>;
  createRecurring(input: Record<string, unknown>): Promise<RecurringSummary>;
  advanceRecurring(id: string): Promise<RecurringSummary>;
}

export interface RecurringPageState { templates: RecurringSummary[]; dueCount: number; loading: boolean; error: string }

export class RecurringPageModel {
  state: RecurringPageState = { templates: [], dueCount: 0, loading: false, error: '' };
  constructor(private readonly api: RecurringApiPort) {}

  async load(): Promise<void> {
    this.state.loading = true;
    try {
      this.state.templates = await this.api.fetchRecurring();
      this.state.dueCount = this.state.templates.filter((item) => item.active).length;
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : '加载周期账单失败';
    } finally { this.state.loading = false; }
  }

  async create(input: Record<string, unknown>): Promise<boolean> {
    const amount = input.amountMinor;
    const day = input.dayOfMonth;
    if (!Number.isInteger(amount) || (amount as number) <= 0 || !Number.isInteger(day) || (day as number) < 1 || (day as number) > 31) {
      this.state.error = '周期账单金额和日期无效';
      return false;
    }
    try { this.state.templates.push(await this.api.createRecurring(input)); this.state.dueCount += 1; return true; }
    catch (error) { this.state.error = error instanceof Error ? error.message : '创建周期账单失败'; return false; }
  }

  async advance(id: string): Promise<boolean> {
    try {
      const updated = await this.api.advanceRecurring(id);
      const index = this.state.templates.findIndex((item) => item.id === id);
      if (index >= 0) this.state.templates[index] = { ...this.state.templates[index], ...updated };
      return true;
    } catch (error) { this.state.error = error instanceof Error ? error.message : '更新周期账单失败'; return false; }
  }
}

interface PageContext { setData(data: unknown): void }

export function createRecurringPage(model: RecurringPageModel) {
  return {
    data: model.state,
    async onShow(this: PageContext) { await model.load(); this.setData(model.state); },
  };
}

declare function Page(options: Record<string, unknown>): void;
declare function getApp<T>(): unknown;
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
  const runtime = getRuntime();
  Page(createRecurringPage(new RecurringPageModel(runtime.api)));
}
