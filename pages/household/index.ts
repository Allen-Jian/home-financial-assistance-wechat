import type { HouseholdInvite, HouseholdMember } from '../../src/api/contracts';
import { getRuntime } from '../../app';

export type HouseholdRole = 'owner' | 'member';
export interface HouseholdApiPort {
  fetchMembers(): Promise<HouseholdMember[]>;
  createInvite(expiresInDays: number): Promise<HouseholdInvite>;
  removeMember(membershipId: string): Promise<unknown>;
}
export interface HouseholdState {
  members: HouseholdMember[];
  role: HouseholdRole;
  invite: HouseholdInvite | null;
  copied: boolean;
  pendingRemovalId: string | null;
  loading: boolean;
  error: string;
}

export class HouseholdPageModel {
  state: HouseholdState;
  constructor(private readonly api: HouseholdApiPort, role: HouseholdRole, private readonly copy: (value: string) => void | Promise<void>) {
    this.state = { members: [], role, invite: null, copied: false, pendingRemovalId: null, loading: false, error: '' };
  }

  setRole(role: HouseholdRole): void { this.state.role = role; }

  async load(): Promise<void> {
    this.state.loading = true;
    try { this.state.members = await this.api.fetchMembers(); }
    catch (error) { this.state.error = error instanceof Error ? error.message : '加载家庭成员失败'; }
    finally { this.state.loading = false; }
  }

  async createInvite(expiresInDays: number): Promise<boolean> {
    if (this.state.role !== 'owner') { this.state.error = '只有家庭所有者可以邀请成员'; return false; }
    if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 30) { this.state.error = '邀请码有效期需为 1 到 30 天'; return false; }
    try { this.state.invite = await this.api.createInvite(expiresInDays); this.state.copied = false; return true; }
    catch (error) { this.state.error = error instanceof Error ? error.message : '创建邀请码失败'; return false; }
  }

  async copyInvite(): Promise<boolean> {
    if (!this.state.invite) return false;
    await this.copy(this.state.invite.code);
    this.state.copied = true;
    return true;
  }

  requestRemove(membershipId: string): boolean {
    if (this.state.role !== 'owner') { this.state.error = '只有家庭所有者可以移除成员'; return false; }
    const member = this.state.members.find((item) => item.membershipId === membershipId);
    if (!member || member.role === 'owner') return false;
    this.state.pendingRemovalId = membershipId;
    return false;
  }

  cancelRemove(): void { this.state.pendingRemovalId = null; }

  async confirmRemove(): Promise<boolean> {
    const id = this.state.pendingRemovalId;
    if (!id || this.state.role !== 'owner') return false;
    try {
      await this.api.removeMember(id);
      this.state.members = this.state.members.filter((member) => member.membershipId !== id);
      this.state.pendingRemovalId = null;
      return true;
    } catch (error) { this.state.error = error instanceof Error ? error.message : '移除成员失败'; return false; }
  }
}

interface PageContext { setData(data: unknown): void }

interface WxHouseholdRuntime {
  setClipboardData(options: { data: string; success?: () => void; fail?: (error: unknown) => void }): void;
  showModal(options: { title: string; content: string; success: (result: { confirm?: boolean }) => void }): void;
}

declare const wx: WxHouseholdRuntime;

function tokenSubject(token: string | undefined): string | undefined {
  if (!token) return undefined;
  try {
    const encoded = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
    if (!encoded) return undefined;
    const json = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='))) as Record<string, unknown>;
    return typeof json.sub === 'string' ? json.sub : undefined;
  } catch { return undefined; }
}

export function createHouseholdPage(model: HouseholdPageModel) {
  return {
    data: model.state,
    async onShow(this: PageContext) { await model.load(); this.setData(model.state); },
    async createInvite(this: PageContext) { await model.createInvite(7); this.setData(model.state); },
    async copyInvite(this: PageContext) { await model.copyInvite(); this.setData(model.state); },
    remove(this: PageContext, event: { currentTarget?: { dataset?: { id?: string } } }) {
      const id = event.currentTarget?.dataset?.id;
      if (!id) return;
      model.requestRemove(id);
      if (model.state.pendingRemovalId !== id) return;
      wx.showModal({ title: '移除成员', content: '确定移除该家庭成员吗？', success: async (result) => {
        if (result.confirm) await model.confirmRemove();
        else model.cancelRemove();
        this.setData(model.state);
      } });
    },
  };
}

declare function Page(options: Record<string, unknown>): void;
declare function getApp<T>(): unknown;
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
  const runtime = getRuntime();
  const currentUserId = tokenSubject(runtime.sessions.read()?.accessToken);
  const model = new HouseholdPageModel(runtime.api, 'member', (value) => new Promise<void>((resolve, reject) => wx.setClipboardData({ data: value, success: () => resolve(), fail: reject })));
  const page = createHouseholdPage(model);
  const originalOnShow = page.onShow;
  page.onShow = async function(this: PageContext) {
    await originalOnShow.call(this);
    const current = model.state.members.find((member) => member.userId === currentUserId);
    if (current) { model.setRole(current.role); this.setData(model.state); }
  };
  Page(page);
}
