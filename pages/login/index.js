"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoginPageModel = void 0;
exports.createLoginPage = createLoginPage;
const app_1 = require("../../app");
const themed_page_1 = require("../../src/shared/themed-page");
class LoginPageModel {
    constructor(auth, sessions, navigate, passwordApi) {
        this.auth = auth;
        this.sessions = sessions;
        this.navigate = navigate;
        this.passwordApi = passwordApi;
        this.state = { inviteCode: '', householdName: '我的家庭', username: '', password: '', loading: false, error: '' };
    }
    setInviteCode(value) { this.state.inviteCode = value.trim(); }
    setHouseholdName(value) { this.state.householdName = value; }
    setUsername(value) { this.state.username = value; }
    setPassword(value) { this.state.password = value; }
    async login() {
        this.state.loading = true;
        this.state.error = '';
        try {
            const result = await this.auth.login({
                inviteCode: this.state.inviteCode || undefined,
                householdName: this.state.householdName.trim() || undefined,
            });
            this.sessions.save(result);
            this.navigate('/pages/dashboard/index');
            return true;
        }
        catch (error) {
            this.state.error = error instanceof Error ? error.message : '登录失败，请稍后重试';
            return false;
        }
        finally {
            this.state.loading = false;
        }
    }
    async passwordLogin() {
        const username = this.state.username.trim();
        const password = this.state.password;
        if (!username || !password) {
            this.state.error = '请输入账号和密码';
            return false;
        }
        if (!this.passwordApi) {
            this.state.error = '账号登录暂不可用';
            return false;
        }
        this.state.loading = true;
        this.state.error = '';
        try {
            const result = await this.passwordApi.loginWithPassword({ username, password });
            this.sessions.save(result);
            this.state.password = '';
            this.navigate('/pages/dashboard/index');
            return true;
        }
        catch (error) {
            this.state.error = error instanceof Error ? error.message : '账号或密码不正确';
            return false;
        }
        finally {
            this.state.loading = false;
        }
    }
}
exports.LoginPageModel = LoginPageModel;
function createLoginPage(model) {
    return {
        data: model.state,
        onInviteCodeInput(event) { var _a, _b; model.setInviteCode((_b = (_a = event.detail) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : ''); this.setData(model.state); },
        onHouseholdNameInput(event) { var _a, _b; model.setHouseholdName((_b = (_a = event.detail) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : ''); this.setData(model.state); },
        onUsernameInput(event) { var _a, _b; model.setUsername((_b = (_a = event.detail) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : ''); this.setData(model.state); },
        onPasswordInput(event) { var _a, _b; model.setPassword((_b = (_a = event.detail) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : ''); this.setData(model.state); },
        async submit() { await model.login(); this.setData(model.state); },
        async submitPassword() { await model.passwordLogin(); this.setData(model.state); },
    };
}
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
    const runtime = (0, app_1.getRuntime)();
    Page((0, themed_page_1.withThemePage)(createLoginPage(new LoginPageModel(runtime.auth, runtime.sessions, (route) => {
        if (route === '/pages/dashboard/index')
            wx.switchTab({ url: route });
    }, runtime.api)), runtime.theme));
}
