import type { AccountSummary } from '../../../src/api/contracts';
import { getRuntime } from '../../../app';
import { parseNzdMinor } from '../../../src/domain/money';

export interface AssetSettingsApiPort {
  fetchAccounts(): Promise<AccountSummary[]>;
  setInitialAsset?: (amountMinor: number, expectedVersion: number) => Promise<AccountSummary>;
  updateOpeningBalance?: (amountMinor: number, expectedVersion: number) => Promise<AccountSummary>;
}

export interface AssetSettingsState {
  primary: AccountSummary | null;
  amount: string;
  loading: boolean;
  error: string;
  saved: boolean;
}

export class AssetSettingsModel {
  state: AssetSettingsState = { primary: null, amount: '', loading: false, error: '', saved: false };

  constructor(private readonly api: AssetSettingsApiPort) {}

  setAmount(amount: string): void { this.state.amount = amount; }

  async load(): Promise<void> {
    this.state.loading = true;
    this.state.error = '';
    try {
      const accounts = await this.api.fetchAccounts();
      this.state.primary = accounts.find((account) => account.systemKey === 'PRIMARY') ?? null;
      if (this.state.primary) this.state.amount = (this.state.primary.openingBalanceMinor / 100).toFixed(2);
    } catch (error) { this.state.error = error instanceof Error ? error.message : '加载初始资产失败'; }
    finally { this.state.loading = false; }
  }

  async saveInitialAsset(): Promise<boolean> {
    this.state.error = '';
    this.state.saved = false;
    if (!this.state.primary) { this.state.error = '未找到家庭资产账户'; return false; }
    let amountMinor: number;
    try { amountMinor = parseNzdMinor(this.state.amount); } catch { this.state.error = '请输入有效金额'; return false; }
    const expectedVersion = this.state.primary.version ?? 0;
    try {
      if (this.api.setInitialAsset) this.state.primary = await this.api.setInitialAsset(amountMinor, expectedVersion);
      else if (this.api.updateOpeningBalance) this.state.primary = await this.api.updateOpeningBalance(amountMinor, expectedVersion);
      else { this.state.error = '初始资产功能暂不可用'; return false; }
      this.state.amount = (this.state.primary.openingBalanceMinor / 100).toFixed(2);
      this.state.saved = true;
      return true;
    } catch (error) { this.state.error = error instanceof Error ? error.message : '保存初始资产失败'; return false; }
  }
}

interface PageContext { setData(data: unknown): void }

export function createAssetSettingsPage(model: AssetSettingsModel) {
  return {
    data: model.state,
    async onShow(this: PageContext) { await model.load(); this.setData(model.state); },
    onAmountInput(this: PageContext, event: { detail?: { value?: string } }) { model.setAmount(event.detail?.value ?? ''); this.setData(model.state); },
    async save(this: PageContext) { await model.saveInitialAsset(); this.setData(model.state); },
  };
}

declare function Page(options: Record<string, unknown>): void;
declare function getApp<T>(): T;
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
  const runtime = getRuntime();
  Page(createAssetSettingsPage(new AssetSettingsModel(runtime.api)));
}
