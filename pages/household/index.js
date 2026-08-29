"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HouseholdPageModel = void 0;
exports.createHouseholdPage = createHouseholdPage;
const app_1 = require("../../app");
class HouseholdPageModel {
    constructor(api, role, copy) {
        this.api = api;
        this.copy = copy;
        this.state = { members: [], role, invite: null, copied: false, pendingRemovalId: null, loading: false, error: '' };
    }
    setRole(role) { this.state.role = role; }
    async load() {
        this.state.loading = true;
        try {
            this.state.members = await this.api.fetchMembers();
        }
        catch (error) {
            this.state.error = error instanceof Error ? error.message : '加载家庭成员失败';
        }
        finally {
            this.state.loading = false;
        }
    }
    async createInvite(expiresInDays) {
        if (this.state.role !== 'owner') {
            this.state.error = '只有家庭所有者可以邀请成员';
            return false;
        }
        if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 30) {
            this.state.error = '邀请码有效期需为 1 到 30 天';
            return false;
        }
        try {
            this.state.invite = await this.api.createInvite(expiresInDays);
            this.state.copied = false;
            return true;
        }
        catch (error) {
            this.state.error = error instanceof Error ? error.message : '创建邀请码失败';
            return false;
        }
    }
    async copyInvite() {
        if (!this.state.invite)
            return false;
        await this.copy(this.state.invite.code);
        this.state.copied = true;
        return true;
    }
    requestRemove(membershipId) {
        if (this.state.role !== 'owner') {
            this.state.error = '只有家庭所有者可以移除成员';
            return false;
        }
        const member = this.state.members.find((item) => item.membershipId === membershipId);
        if (!member || member.role === 'owner')
            return false;
        this.state.pendingRemovalId = membershipId;
        return false;
    }
    cancelRemove() { this.state.pendingRemovalId = null; }
    async confirmRemove() {
        const id = this.state.pendingRemovalId;
        if (!id || this.state.role !== 'owner')
            return false;
        try {
            await this.api.removeMember(id);
            this.state.members = this.state.members.filter((member) => member.membershipId !== id);
            this.state.pendingRemovalId = null;
            return true;
        }
        catch (error) {
            this.state.error = error instanceof Error ? error.message : '移除成员失败';
            return false;
        }
    }
}
exports.HouseholdPageModel = HouseholdPageModel;
function tokenSubject(token) {
    var _a;
    if (!token)
        return undefined;
    try {
        const encoded = (_a = token.split('.')[1]) === null || _a === void 0 ? void 0 : _a.replace(/-/g, '+').replace(/_/g, '/');
        if (!encoded)
            return undefined;
        const json = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
        return typeof json.sub === 'string' ? json.sub : undefined;
    }
    catch {
        return undefined;
    }
}
function createHouseholdPage(model) {
    return {
        data: model.state,
        async onShow() { await model.load(); this.setData(model.state); },
        async createInvite() { await model.createInvite(7); this.setData(model.state); },
        async copyInvite() { await model.copyInvite(); this.setData(model.state); },
        remove(event) {
            var _a, _b;
            const id = (_b = (_a = event.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.id;
            if (!id)
                return;
            model.requestRemove(id);
            if (model.state.pendingRemovalId !== id)
                return;
            wx.showModal({ title: '移除成员', content: '确定移除该家庭成员吗？', success: async (result) => {
                    if (result.confirm)
                        await model.confirmRemove();
                    else
                        model.cancelRemove();
                    this.setData(model.state);
                } });
        },
    };
}
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
    const runtime = (0, app_1.getRuntime)();
    const currentUserId = tokenSubject((_a = runtime.sessions.read()) === null || _a === void 0 ? void 0 : _a.accessToken);
    const model = new HouseholdPageModel(runtime.api, 'member', (value) => new Promise((resolve, reject) => wx.setClipboardData({ data: value, success: () => resolve(), fail: reject })));
    const page = createHouseholdPage(model);
    const originalOnShow = page.onShow;
    page.onShow = async function () {
        await originalOnShow.call(this);
        const current = model.state.members.find((member) => member.userId === currentUserId);
        if (current) {
            model.setRole(current.role);
            this.setData(model.state);
        }
    };
    Page(page);
}
