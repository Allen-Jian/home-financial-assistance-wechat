import type { CategorySummary } from '../../../src/api/contracts';
import { getRuntime } from '../../../app';
import { withThemePage } from '../../../src/shared/themed-page';

export type CategoryDirection = 'income' | 'expense';
export interface CategorySettingsApiPort {
  updateCategory(id: string, input: { name?: string; active?: boolean }): Promise<CategorySummary>;
  fetchCategories?: (includeInactive?: boolean) => Promise<CategorySummary[]>;
  createCategory?: (input: { name: string; direction: CategoryDirection }) => Promise<CategorySummary>;
}

export interface CategorySettingsState {
  categories: CategorySummary[];
  directionOptions: string[];
  name: string;
  direction: CategoryDirection;
  loading: boolean;
  error: string;
}

export class CategorySettingsModel {
  state: CategorySettingsState = { categories: [], directionOptions: ['支出', '收入'], name: '', direction: 'expense', loading: false, error: '' };

  constructor(private readonly api: CategorySettingsApiPort) {}

  setName(name: string): void { this.state.name = name; }
  setDirection(direction: CategoryDirection): void { this.state.direction = direction; }

  async load(): Promise<void> {
    if (!this.api.fetchCategories) return;
    this.state.loading = true;
    this.state.error = '';
    try { this.state.categories = await this.api.fetchCategories(true); }
    catch (error) { this.state.error = error instanceof Error ? error.message : '加载分类失败'; }
    finally { this.state.loading = false; }
  }

  async create(input: { name: string; direction: CategoryDirection }): Promise<boolean> {
    if (!input.name.trim()) { this.state.error = '分类名称不能为空'; return false; }
    if (!this.api.createCategory) { this.state.error = '分类功能暂不可用'; return false; }
    try {
      this.state.categories.push(await this.api.createCategory({ name: input.name.trim(), direction: input.direction }));
      return true;
    } catch (error) { this.state.error = error instanceof Error ? error.message : '创建分类失败'; return false; }
  }

  async rename(id: string, name: string): Promise<boolean> {
    if (!name.trim()) { this.state.error = '分类名称不能为空'; return false; }
    try {
      const updated = await this.api.updateCategory(id, { name: name.trim() });
      this.replace(updated);
      return true;
    } catch (error) { this.state.error = error instanceof Error ? error.message : '重命名分类失败'; return false; }
  }

  async setActive(id: string, active: boolean): Promise<boolean> {
    try {
      const updated = await this.api.updateCategory(id, { active });
      this.replace(updated);
      return true;
    } catch (error) { this.state.error = error instanceof Error ? error.message : '更新分类状态失败'; return false; }
  }

  private replace(updated: CategorySummary): void {
    const index = this.state.categories.findIndex((category) => category.id === updated.id);
    if (index >= 0) this.state.categories[index] = { ...this.state.categories[index], ...updated };
    else this.state.categories.push(updated);
  }
}

interface PageContext { setData(data: unknown): void }

export function createCategorySettingsPage(model: CategorySettingsModel) {
  return {
    data: model.state,
    async onShow(this: PageContext) { await model.load(); this.setData(model.state); },
    onNameInput(this: PageContext, event: { detail?: { value?: string } }) { model.setName(event.detail?.value ?? ''); this.setData(model.state); },
    onDirectionChange(this: PageContext, event: { detail?: { value?: number } }) { model.setDirection(Number(event.detail?.value) === 1 ? 'income' : 'expense'); this.setData(model.state); },
    async create(this: PageContext) { await model.create({ name: model.state.name, direction: model.state.direction }); this.setData(model.state); },
    async rename(this: PageContext, event: { currentTarget?: { dataset?: { id?: string } }; detail?: { value?: string } }) {
      const id = event.currentTarget?.dataset?.id;
      const name = event.detail?.value;
      if (id && name) await model.rename(id, name);
      this.setData(model.state);
    },
    async toggleActive(this: PageContext, event: { currentTarget?: { dataset?: { id?: string; active?: string | boolean } } }) {
      const id = event.currentTarget?.dataset?.id;
      const raw = event.currentTarget?.dataset?.active;
      if (id) await model.setActive(id, !(raw === true || raw === 'true'));
      this.setData(model.state);
    },
  };
}

declare function Page(options: Record<string, unknown>): void;
declare function getApp<T>(): T;
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
  const runtime = getRuntime();
  Page(withThemePage(createCategorySettingsPage(new CategorySettingsModel(runtime.api)), runtime.theme));
}
