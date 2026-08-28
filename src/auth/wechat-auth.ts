import type { AppConfig } from '../shared/config';
import type { WechatLoginRequest, WechatLoginResponse } from '../api/contracts';

export interface WechatLoginOptions {
  inviteCode?: string;
  householdName?: string;
}

export interface WechatLoginPort {
  login(): Promise<string>;
}

export interface AuthApiPort {
  loginWithWechat(input: WechatLoginRequest): Promise<WechatLoginResponse>;
}

interface WxRuntime {
  login(options: {
    success: (result: { code?: string }) => void;
    fail: (error: unknown) => void;
  }): void;
}

declare const wx: WxRuntime;

export function createWxLoginPort(): WechatLoginPort {
  return {
    login: () => new Promise((resolve, reject) => {
      wx.login({
        success: (result) => result.code ? resolve(result.code) : reject(new Error('wx.login returned no code')),
        fail: reject,
      });
    }),
  };
}

const defaultMockResult: WechatLoginResponse = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  householdId: 'mock-household',
  isNewUser: true,
};

export class WechatAuth {
  constructor(
    private readonly config: AppConfig,
    private readonly wxLogin: WechatLoginPort,
    private readonly api: AuthApiPort,
    private readonly mockResult: WechatLoginResponse = defaultMockResult,
  ) {}

  async login(options: WechatLoginOptions = {}): Promise<WechatLoginResponse> {
    if (this.config.mockAuth) return this.mockResult;
    const code = await this.wxLogin.login();
    const request: WechatLoginRequest = { code };
    if (options.inviteCode) request.inviteCode = options.inviteCode;
    if (options.householdName) request.householdName = options.householdName;
    return this.api.loginWithWechat(request);
  }
}
