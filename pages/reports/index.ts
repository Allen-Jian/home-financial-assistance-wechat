import type { ReportSummary } from '../../src/api/contracts';
import { getPeriodBounds, type PeriodKind } from '../../src/domain/period';
import { getRuntime } from '../../app';
import { formatNzdMinor } from '../../src/domain/money';
import { withThemePage } from '../../src/shared/themed-page';

export interface ReportPeriodQuery { from: string; to: string; category?: string }
export interface ReportApiPort {
  fetchReports(period: ReportPeriodQuery): Promise<ReportSummary>;
  exportTransactions(period: ReportPeriodQuery, format: 'json' | 'csv'): Promise<unknown>;
}

export interface ReportPageState {
  periodKind: PeriodKind;
  period: ReportPeriodQuery;
  report: ReportSummary | null;
  selectedCategory: string;
  loading: boolean;
  error: string;
  exported: unknown;
  incomeDisplay: string;
  expenseDisplay: string;
  netDisplay: string;
  categoryBreakdown: Array<{ label: string; amountDisplay: string }>;
}

export class ReportPageModel {
  state: ReportPageState = {
    periodKind: 'month', period: { from: '', to: '' }, report: null, selectedCategory: '',
    loading: false, error: '', exported: null, incomeDisplay: '', expenseDisplay: '', netDisplay: '', categoryBreakdown: [],
  };

  constructor(private readonly api: ReportApiPort) {}

  async load(kind: PeriodKind, anchor: Date): Promise<boolean> {
    const bounds = getPeriodBounds(anchor, kind);
    const period = { from: bounds.from.toISOString(), to: bounds.to.toISOString() };
    this.state.periodKind = kind;
    this.state.period = period;
    this.state.selectedCategory = '';
    this.state.loading = true;
    this.state.error = '';
    try {
      this.applyReport(await this.api.fetchReports(period));
      return true;
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : '加载报表失败';
      return false;
    } finally {
      this.state.loading = false;
    }
  }

  async drillDownCategory(category: string): Promise<boolean> {
    if (!this.state.report) return false;
    this.state.selectedCategory = category;
    try {
      this.applyReport(await this.api.fetchReports({ ...this.state.period, category }));
      return true;
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : '加载分类明细失败';
      return false;
    }
  }

  async export(format: 'json' | 'csv'): Promise<unknown> {
    this.state.exported = await this.api.exportTransactions(this.state.period, format);
    return this.state.exported;
  }

  private applyReport(report: ReportSummary): void {
    this.state.report = report;
    this.state.incomeDisplay = formatNzdMinor(report.incomeMinor);
    this.state.expenseDisplay = formatNzdMinor(report.expenseMinor);
    const net = report.incomeMinor - report.expenseMinor;
    this.state.netDisplay = `${net > 0 ? '+ ' : net < 0 ? '− ' : ''}${formatNzdMinor(Math.abs(net))}`;
    this.state.categoryBreakdown = report.categoryBreakdown.map((row) => ({ label: row.label, amountDisplay: formatNzdMinor(row.amountMinor) }));
  }
}

interface PageContext { setData(data: unknown): void }

export function createReportsPage(model: ReportPageModel) {
  return {
    data: model.state,
    async onShow(this: PageContext) { await model.load('month', new Date()); this.setData(model.state); },
    async changePeriod(this: PageContext, event: { currentTarget?: { dataset?: { kind?: string } } }) {
      const kind = event.currentTarget?.dataset?.kind;
      if (kind === 'month' || kind === 'quarter' || kind === 'year') await model.load(kind, new Date());
      this.setData(model.state);
    },
    async drillDown(this: PageContext, event: { currentTarget?: { dataset?: { category?: string } } }) {
      await model.drillDownCategory(event.currentTarget?.dataset?.category ?? '');
      this.setData(model.state);
    },
    async exportJson(this: PageContext) { await model.export('json'); this.setData(model.state); },
    async exportCsv(this: PageContext) { await model.export('csv'); this.setData(model.state); },
  };
}

declare function Page(options: Record<string, unknown>): void;
declare function getApp<T>(): unknown;
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
  const runtime = getRuntime();
  Page(withThemePage(createReportsPage(new ReportPageModel(runtime.api as unknown as ReportApiPort)), runtime.theme));
}
