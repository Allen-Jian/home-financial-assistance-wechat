import type { ReportPeriodQuery } from '../reports/index';
import { getRuntime } from '../../app';
import { getPeriodBounds } from '../../src/domain/period';
import { withThemePage } from '../../src/shared/themed-page';

export interface MoreApiPort { exportTransactions(period: ReportPeriodQuery, format: 'json' | 'csv'): Promise<unknown>; logout(): Promise<void> }
export class MorePageModel {
  state = { exported: null as unknown, error: '' };
  constructor(private readonly api: MoreApiPort) {}
  async export(period: ReportPeriodQuery, format: 'json' | 'csv'): Promise<unknown> { this.state.exported = await this.api.exportTransactions(period, format); return this.state.exported; }
  async logout(): Promise<void> { await this.api.logout(); }
}

interface PageContext { setData(data: unknown): void }

export function createMorePage(model: MorePageModel) {
  return {
    data: model.state,
    async exportJson(this: PageContext) { await model.export(currentPeriod(), 'json'); this.setData(model.state); },
    async exportCsv(this: PageContext) { await model.export(currentPeriod(), 'csv'); this.setData(model.state); },
    async logout(this: PageContext) { await model.logout(); wx.reLaunch({ url: '/pages/login/index' }); this.setData(model.state); },
  };
}

function currentPeriod(): ReportPeriodQuery {
  const bounds = getPeriodBounds(new Date(), 'month');
  return { from: bounds.from.toISOString(), to: bounds.to.toISOString() };
}

declare function Page(options: Record<string, unknown>): void;
declare const wx: { reLaunch(options: { url: string }): void };
declare function getApp<T>(): unknown;
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
  const runtime = getRuntime();
  Page(withThemePage(createMorePage(new MorePageModel(runtime.api as unknown as MoreApiPort)), runtime.theme));
}
