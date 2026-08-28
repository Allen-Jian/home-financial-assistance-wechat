import type { ReportPeriodQuery } from '../reports/index';

export interface MoreApiPort { exportTransactions(period: ReportPeriodQuery, format: 'json' | 'csv'): Promise<unknown>; logout(): Promise<void> }
export class MorePageModel {
  state = { exported: null as unknown, error: '' };
  constructor(private readonly api: MoreApiPort) {}
  async export(period: ReportPeriodQuery, format: 'json' | 'csv'): Promise<unknown> { this.state.exported = await this.api.exportTransactions(period, format); return this.state.exported; }
  async logout(): Promise<void> { await this.api.logout(); }
}

declare function Page(options: Record<string, unknown>): void;
if (typeof Page !== 'undefined') Page({ data: { exported: null, error: '' } });
