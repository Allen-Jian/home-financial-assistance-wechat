import type { ReportPeriodQuery } from '../reports/index';
import { getRuntime } from '../../app';
import { getPeriodBounds } from '../../src/domain/period';
import type { ThemePreference, ThemeRuntime } from '../../src/shared/theme-runtime';
import { withThemePage } from '../../src/shared/themed-page';

export interface MoreApiPort { exportTransactions(period: ReportPeriodQuery, format: 'json' | 'csv'): Promise<unknown>; logout(): Promise<void> }
export const THEME_SAVE_WARNING = '外观设置未能保存，下次打开可能恢复为跟随系统';
export const APPEARANCE_OPTIONS: ReadonlyArray<{ label: string; value: ThemePreference }> = [
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' },
  { label: '跟随系统', value: 'system' },
];

interface MoreThemePort { setPreference(value: ThemePreference): ReturnType<ThemeRuntime['setPreference']> }
export class MorePageModel {
  state = { exported: null as unknown, error: '' };
  constructor(private readonly api: MoreApiPort) {}
  async export(period: ReportPeriodQuery, format: 'json' | 'csv'): Promise<unknown> { this.state.exported = await this.api.exportTransactions(period, format); return this.state.exported; }
  async logout(): Promise<void> { await this.api.logout(); }
}

interface PageContext { setData(data: unknown): void }
interface AppearanceEvent { currentTarget?: { dataset?: { value?: unknown } } }

export function createMorePage(model: MorePageModel, theme?: MoreThemePort) {
  return {
    data: { ...model.state, appearanceOptions: APPEARANCE_OPTIONS, themePersistenceWarning: '' },
    async exportJson(this: PageContext) { await model.export(currentPeriod(), 'json'); this.setData(model.state); },
    async exportCsv(this: PageContext) { await model.export(currentPeriod(), 'csv'); this.setData(model.state); },
    async logout(this: PageContext) { await model.logout(); wx.reLaunch({ url: '/pages/login/index' }); this.setData(model.state); },
    onAppearanceSelect(this: PageContext, event: AppearanceEvent) {
      const value = event.currentTarget?.dataset?.value;
      if (value !== 'light' && value !== 'dark' && value !== 'system') return;
      const result = (theme ?? getRuntime().theme).setPreference(value);
      this.setData({ ...result.snapshot, themePersistenceWarning: result.persisted ? '' : THEME_SAVE_WARNING });
    },
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
  Page(withThemePage(createMorePage(new MorePageModel(runtime.api as unknown as MoreApiPort), runtime.theme), runtime.theme));
}
