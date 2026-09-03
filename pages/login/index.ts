import type { TokenPair, WechatLoginResponse } from '../../src/api/contracts';
import { SessionStore } from '../../src/auth/session-store';
import type { WechatAuth } from '../../src/auth/wechat-auth';
import { getRuntime } from '../../app';
import { withThemePage } from '../../src/shared/themed-page';

export interface LoginPageState {
  inviteCode: string;
  householdName: string;
  username: string;
  password: string;
  loading: boolean;
  error: string;
}

export interface PasswordLoginApiPort {
  loginWithPassword(input: { username: string; password: string }): Promise<TokenPair>;
}

interface PageContext { setData(data: unknown): void }

export class LoginPageModel {
  state: LoginPageState = { inviteCode: '', householdName: '我的家庭', username: '', password: '', loading: false, error: '' };

  constructor(
    private readonly auth: Pick<WechatAuth, 'login'>,
    private readonly sessions: SessionStore,
    private readonly navigate: (route: string) => void,
    private readonly passwordApi?: PasswordLoginApiPort,
  ) {}

  setInviteCode(value: string): void { this.state.inviteCode = value.trim(); }
  setHouseholdName(value: string): void { this.state.householdName = value; }
  setUsername(value: string): void { this.state.username = value; }
  setPassword(value: string): void { this.state.password = value; }

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

  async passwordLogin(): Promise<boolean> {
    const username = this.state.username.trim();
    const password = this.state.password;
    if (!username || !password) { this.state.error = '请输入账号和密码'; return false; }
    if (!this.passwordApi) { this.state.error = '账号登录暂不可用'; return false; }
    this.state.loading = true;
    this.state.error = '';
    try {
      const result = await this.passwordApi.loginWithPassword({ username, password });
      this.sessions.save(result);
      this.state.password = '';
      this.navigate('/pages/dashboard/index');
      return true;
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : '账号或密码不正确';
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
    onUsernameInput(this: PageContext, event: { detail?: { value?: string } }) { model.setUsername(event.detail?.value ?? ''); this.setData(model.state); },
    onPasswordInput(this: PageContext, event: { detail?: { value?: string } }) { model.setPassword(event.detail?.value ?? ''); this.setData(model.state); },
    async submit(this: PageContext) { await model.login(); this.setData(model.state); },
    async submitPassword(this: PageContext) { await model.passwordLogin(); this.setData(model.state); },
  };
}

declare function Page(options: Record<string, unknown>): void;
declare function getApp<T>(): unknown;
declare const wx: { switchTab(options: { url: string }): void };
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
  const runtime = getRuntime();
  Page(withThemePage(createLoginPage(new LoginPageModel(runtime.auth, runtime.sessions, (route) => {
    if (route === '/pages/dashboard/index') wx.switchTab({ url: route });
  }, runtime.api as unknown as PasswordLoginApiPort)), runtime.theme));
}
