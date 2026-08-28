import type { HouseholdInvite, HouseholdMember } from '../../src/api/contracts';

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

declare function Page(options: Record<string, unknown>): void;
if (typeof Page !== 'undefined') Page({ data: { members: [], role: 'member', invite: null, copied: false, pendingRemovalId: null, loading: false, error: '' } });
