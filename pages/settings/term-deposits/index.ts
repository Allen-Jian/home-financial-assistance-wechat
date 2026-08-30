import type { TermDepositSummary } from '../../../src/api/contracts';
import { getRuntime } from '../../../app';

export interface TermDepositInput extends Record<string, unknown> {
  name: string;
  principalMinor: number;
  annualRateBasisPoints: number;
  startedAt: string;
  maturesAt: string;
  note?: string;
}

export interface TermDepositSettingsApiPort {
  createTermDeposit(input: TermDepositInput): Promise<TermDepositSummary>;
  fetchTermDeposits?: () => Promise<TermDepositSummary[]>;
  closeTermDeposit?: (id: string, expectedVersion: number) => Promise<TermDepositSummary>;
}

export interface TermDepositSettingsState {
  deposits: TermDepositSummary[];
  draft: TermDepositInput;
  loading: boolean;
  error: string;
}

export class TermDepositSettingsModel {
  state: TermDepositSettingsState = {
    deposits: [], draft: { name: '', principalMinor: 0, annualRateBasisPoints: 0, startedAt: '', maturesAt: '' }, loading: false, error: '',
  };

  constructor(private readonly api: TermDepositSettingsApiPort) {}

  async load(): Promise<void> {
    if (!this.api.fetchTermDeposits) return;
    this.state.loading = true;
    this.state.error = '';
    try { this.state.deposits = await this.api.fetchTermDeposits(); }
    catch (error) { this.state.error = error instanceof Error ? error.message : '加载定存失败'; }
    finally { this.state.loading = false; }
  }

  async create(input: TermDepositInput): Promise<boolean> {
    if (!input.name.trim() || !Number.isInteger(input.principalMinor) || input.principalMinor <= 0 || !Number.isInteger(input.annualRateBasisPoints) || input.annualRateBasisPoints < 0 || !input.startedAt || !input.maturesAt) {
      this.state.error = '定存信息无效';
      return false;
    }
    try { this.state.deposits.push(await this.api.createTermDeposit(input)); return true; }
    catch (error) { this.state.error = error instanceof Error ? error.message : '创建定存失败'; return false; }
  }

  setDraft(input: Partial<TermDepositInput>): void { this.state.draft = { ...this.state.draft, ...input }; }

  async close(id: string, expectedVersion: number): Promise<boolean> {
    if (!this.api.closeTermDeposit) { this.state.error = '定存关闭功能暂不可用'; return false; }
    try {
      const updated = await this.api.closeTermDeposit(id, expectedVersion);
      const index = this.state.deposits.findIndex((deposit) => deposit.id === id);
      if (index >= 0) this.state.deposits[index] = { ...this.state.deposits[index], ...updated };
      return true;
    } catch (error) { this.state.error = error instanceof Error ? error.message : '关闭定存失败'; return false; }
  }
}

interface PageContext { setData(data: unknown): void }

export function createTermDepositSettingsPage(model: TermDepositSettingsModel) {
  return {
    data: model.state,
    async onShow(this: PageContext) { await model.load(); this.setData(model.state); },
    onDraftInput(this: PageContext, event: { currentTarget?: { dataset?: { field?: string } }; detail?: { value?: string } }) {
      const field = event.currentTarget?.dataset?.field;
      const value = event.detail?.value ?? '';
      if (field === 'name' || field === 'startedAt' || field === 'maturesAt' || field === 'note') model.setDraft({ [field]: value } as Partial<TermDepositInput>);
      if (field === 'principalMinor') model.setDraft({ principalMinor: Math.round(Number(value) * 100) });
      if (field === 'annualRateBasisPoints') model.setDraft({ annualRateBasisPoints: Number(value) });
      this.setData(model.state);
    },
    async create(this: PageContext) { await model.create(model.state.draft); this.setData(model.state); },
    async close(this: PageContext, event: { currentTarget?: { dataset?: { id?: string; version?: string } } }) {
      const id = event.currentTarget?.dataset?.id;
      const version = Number(event.currentTarget?.dataset?.version);
      if (id && Number.isInteger(version)) await model.close(id, version);
      this.setData(model.state);
    },
  };
}

declare function Page(options: Record<string, unknown>): void;
declare function getApp<T>(): T;
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
  const runtime = getRuntime();
  Page(createTermDepositSettingsPage(new TermDepositSettingsModel(runtime.api)));
}
