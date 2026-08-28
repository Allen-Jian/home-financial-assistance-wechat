import type { ReportSummary } from '../../src/api/contracts';
import { getPeriodBounds, type PeriodKind } from '../../src/domain/period';

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
}

export class ReportPageModel {
  state: ReportPageState = {
    periodKind: 'month', period: { from: '', to: '' }, report: null, selectedCategory: '',
    loading: false, error: '', exported: null,
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
      this.state.report = await this.api.fetchReports(period);
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
      this.state.report = await this.api.fetchReports({ ...this.state.period, category });
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
}

declare function Page(options: Record<string, unknown>): void;
if (typeof Page !== 'undefined') {
  Page({ data: { periodKind: 'month', period: {}, report: null, selectedCategory: '', loading: false, error: '', exported: null } });
}
