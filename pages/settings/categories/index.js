"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategorySettingsModel = void 0;
exports.createCategorySettingsPage = createCategorySettingsPage;
const app_1 = require("../../../app");
class CategorySettingsModel {
    constructor(api) {
        this.api = api;
        this.state = { categories: [], directionOptions: ['支出', '收入'], name: '', direction: 'expense', loading: false, error: '' };
    }
    setName(name) { this.state.name = name; }
    setDirection(direction) { this.state.direction = direction; }
    async load() {
        if (!this.api.fetchCategories)
            return;
        this.state.loading = true;
        this.state.error = '';
        try {
            this.state.categories = await this.api.fetchCategories(true);
        }
        catch (error) {
            this.state.error = error instanceof Error ? error.message : '加载分类失败';
        }
        finally {
            this.state.loading = false;
        }
    }
    async create(input) {
        if (!input.name.trim()) {
            this.state.error = '分类名称不能为空';
            return false;
        }
        if (!this.api.createCategory) {
            this.state.error = '分类功能暂不可用';
            return false;
        }
        try {
            this.state.categories.push(await this.api.createCategory({ name: input.name.trim(), direction: input.direction }));
            return true;
        }
        catch (error) {
            this.state.error = error instanceof Error ? error.message : '创建分类失败';
            return false;
        }
    }
    async rename(id, name) {
        if (!name.trim()) {
            this.state.error = '分类名称不能为空';
            return false;
        }
        try {
            const updated = await this.api.updateCategory(id, { name: name.trim() });
            this.replace(updated);
            return true;
        }
        catch (error) {
            this.state.error = error instanceof Error ? error.message : '重命名分类失败';
            return false;
        }
    }
    async setActive(id, active) {
        try {
            const updated = await this.api.updateCategory(id, { active });
            this.replace(updated);
            return true;
        }
        catch (error) {
            this.state.error = error instanceof Error ? error.message : '更新分类状态失败';
            return false;
        }
    }
    replace(updated) {
        const index = this.state.categories.findIndex((category) => category.id === updated.id);
        if (index >= 0)
            this.state.categories[index] = { ...this.state.categories[index], ...updated };
        else
            this.state.categories.push(updated);
    }
}
exports.CategorySettingsModel = CategorySettingsModel;
function createCategorySettingsPage(model) {
    return {
        data: model.state,
        async onShow() { await model.load(); this.setData(model.state); },
        onNameInput(event) { var _a, _b; model.setName((_b = (_a = event.detail) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : ''); this.setData(model.state); },
        onDirectionChange(event) { var _a; model.setDirection(Number((_a = event.detail) === null || _a === void 0 ? void 0 : _a.value) === 1 ? 'income' : 'expense'); this.setData(model.state); },
        async create() { await model.create({ name: model.state.name, direction: model.state.direction }); this.setData(model.state); },
        async rename(event) {
            var _a, _b, _c;
            const id = (_b = (_a = event.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.id;
            const name = (_c = event.detail) === null || _c === void 0 ? void 0 : _c.value;
            if (id && name)
                await model.rename(id, name);
            this.setData(model.state);
        },
        async toggleActive(event) {
            var _a, _b, _c, _d;
            const id = (_b = (_a = event.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.id;
            const raw = (_d = (_c = event.currentTarget) === null || _c === void 0 ? void 0 : _c.dataset) === null || _d === void 0 ? void 0 : _d.active;
            if (id)
                await model.setActive(id, !(raw === true || raw === 'true'));
            this.setData(model.state);
        },
    };
}
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
    const runtime = (0, app_1.getRuntime)();
    Page(createCategorySettingsPage(new CategorySettingsModel(runtime.api)));
}
