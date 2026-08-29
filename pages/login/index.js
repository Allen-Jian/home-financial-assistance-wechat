"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoginPageModel = void 0;
exports.createLoginPage = createLoginPage;
const app_1 = require("../../app");
class LoginPageModel {
    constructor(auth, sessions, navigate) {
        this.auth = auth;
        this.sessions = sessions;
        this.navigate = navigate;
        this.state = { inviteCode: '', householdName: '我的家庭', loading: false, error: '' };
    }
    setInviteCode(value) { this.state.inviteCode = value.trim(); }
    setHouseholdName(value) { this.state.householdName = value; }
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
}
exports.LoginPageModel = LoginPageModel;
function createLoginPage(model) {
    return {
        data: model.state,
        onInviteCodeInput(event) { var _a, _b; model.setInviteCode((_b = (_a = event.detail) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : ''); this.setData(model.state); },
        onHouseholdNameInput(event) { var _a, _b; model.setHouseholdName((_b = (_a = event.detail) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : ''); this.setData(model.state); },
        async submit() { await model.login(); this.setData(model.state); },
    };
}
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
    const runtime = (0, app_1.getRuntime)();
    Page(createLoginPage(new LoginPageModel(runtime.auth, runtime.sessions, (route) => {
        if (route === '/pages/dashboard/index')
            wx.switchTab({ url: route });
    })));
}
