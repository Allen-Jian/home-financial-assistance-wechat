import type { WechatLoginResponse } from '../../src/api/contracts';
import { SessionStore } from '../../src/auth/session-store';
import type { WechatAuth } from '../../src/auth/wechat-auth';

export interface LoginPageState {
  inviteCode: string;
  householdName: string;
  loading: boolean;
  error: string;
}

interface PageContext { setData(data: unknown): void }

export class LoginPageModel {
  state: LoginPageState = { inviteCode: '', householdName: '我的家庭', loading: false, error: '' };

  constructor(
    private readonly auth: Pick<WechatAuth, 'login'>,
    private readonly sessions: SessionStore,
    private readonly navigate: (route: string) => void,
  ) {}

  setInviteCode(value: string): void { this.state.inviteCode = value.trim(); }
  setHouseholdName(value: string): void { this.state.householdName = value; }

  async login(): Promise<boolean> {
    this.state.loading = true;
    this.state.error = '';
    try {
      const result: WechatLoginResponse = await this.auth.login({
        inviteCode: this.state.inviteCode || undefined,
        householdName: this.state.householdName.trim() || undefined,
      });
      this.sessions.save(result);
      this.navigate('/pages/dashboard/index');
      return true;
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : '登录失败，请稍后重试';
      return false;
    } finally {
      this.state.loading = false;
    }
  }
}

export function createLoginPage(model: LoginPageModel) {
  return {
    data: model.state,
    onInviteCodeInput(this: PageContext, event: { detail?: { value?: string } }) { model.setInviteCode(event.detail?.value ?? ''); this.setData(model.state); },
    onHouseholdNameInput(this: PageContext, event: { detail?: { value?: string } }) { model.setHouseholdName(event.detail?.value ?? ''); this.setData(model.state); },
    async submit(this: PageContext) { await model.login(); this.setData(model.state); },
  };
}

declare function Page(options: Record<string, unknown>): void;
if (typeof Page !== 'undefined') {
  Page({
    data: { inviteCode: '', householdName: '我的家庭', loading: false, error: '' },
    onInviteCodeInput(this: PageContext, event: { detail?: { value?: string } }) { this.setData({ inviteCode: event.detail?.value ?? '' }); },
    onHouseholdNameInput(this: PageContext, event: { detail?: { value?: string } }) { this.setData({ householdName: event.detail?.value ?? '' }); },
  });
}
