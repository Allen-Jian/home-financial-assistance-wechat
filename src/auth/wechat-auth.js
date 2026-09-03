"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WechatAuth = void 0;
exports.createWxLoginPort = createWxLoginPort;
function createWxLoginPort() {
    return {
        login: () => new Promise((resolve, reject) => {
            wx.login({
                success: (result) => result.code ? resolve(result.code) : reject(new Error('wx.login returned no code')),
                fail: reject,
            });
        }),
    };
}
const defaultMockResult = {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    householdId: 'mock-household',
    isNewUser: true,
};
class WechatAuth {
    constructor(config, wxLogin, api, mockResult = defaultMockResult) {
        this.config = config;
        this.wxLogin = wxLogin;
        this.api = api;
        this.mockResult = mockResult;
    }
    async login(options = {}) {
        if (this.config.mockAuth)
            return this.mockResult;
        const code = await this.wxLogin.login();
        const request = { code };
        if (options.inviteCode)
            request.inviteCode = options.inviteCode;
        if (options.householdName)
            request.householdName = options.householdName;
        return this.api.loginWithWechat(request);
    }
}
exports.WechatAuth = WechatAuth;
