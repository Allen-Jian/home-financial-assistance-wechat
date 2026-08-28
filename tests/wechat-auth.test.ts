import { WechatAuth, type AuthApiPort, type WechatLoginPort } from '../src/auth/wechat-auth';
import type { AppConfig } from '../src/shared/config';

const config: AppConfig = { apiBaseUrl: 'https://ledger-api.test/v1', mockAuth: false };

test('calls wx.login and forwards the code to the API', async () => {
  const wx: WechatLoginPort = { login: jest.fn().mockResolvedValue('temporary-code') };
  const api: AuthApiPort = {
    loginWithWechat: jest.fn().mockResolvedValue({
      accessToken: 'a', refreshToken: 'r', householdId: 'h-1', isNewUser: false,
    }),
  };
  const result = await new WechatAuth(config, wx, api).login({ inviteCode: 'INVITE' });
  expect(api.loginWithWechat).toHaveBeenCalledWith({ code: 'temporary-code', inviteCode: 'INVITE' });
  expect(result.householdId).toBe('h-1');
});

test('Mock login creates the first household owner without calling wx.login', async () => {
  const wx: WechatLoginPort = { login: jest.fn() };
  const api: AuthApiPort = { loginWithWechat: jest.fn() };
  const mockConfig: AppConfig = { ...config, mockAuth: true };
  const result = await new WechatAuth(mockConfig, wx, api).login({ householdName: '我的家庭' });
  expect(wx.login).not.toHaveBeenCalled();
  expect(api.loginWithWechat).not.toHaveBeenCalled();
  expect(result).toEqual(expect.objectContaining({ householdId: 'mock-household', isNewUser: true }));
});
