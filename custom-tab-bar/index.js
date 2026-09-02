"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TAB_SLOTS = void 0;
exports.createCustomTabBar = createCustomTabBar;
const app_1 = require("../app");
exports.TAB_SLOTS = [
    { label: '首页', pagePath: 'pages/dashboard/index', icon: '/assets/tabbar/home.png', selectedIcon: '/assets/tabbar/home-selected.png' },
    { label: '账目', pagePath: 'pages/ledger/index', icon: '/assets/tabbar/ledger.png', selectedIcon: '/assets/tabbar/ledger-selected.png' },
    { label: '记账', action: 'entry' },
    { label: 'AI 聊天', pagePath: 'pages/ai/index', icon: '/assets/tabbar/ai.png', selectedIcon: '/assets/tabbar/ai-selected.png' },
    { label: '设置', pagePath: 'pages/more/index', icon: '/assets/tabbar/settings.png', selectedIcon: '/assets/tabbar/settings-selected.png' },
];
function readIndex(input) {
    var _a, _b;
    if (typeof input === 'number')
        return input;
    const value = (_b = (_a = input.currentTarget) === null || _a === void 0 ? void 0 : _a.dataset) === null || _b === void 0 ? void 0 : _b.index;
    return typeof value === 'number' ? value : Number(value);
}
function createCustomTabBar(theme) {
    var _a;
    return {
        data: {
            slots: exports.TAB_SLOTS,
            selected: 0,
            openingEntry: false,
            ...((_a = theme === null || theme === void 0 ? void 0 : theme.getSnapshot()) !== null && _a !== void 0 ? _a : {}),
        },
        lifetimes: {
            attached() {
                const runtime = theme !== null && theme !== void 0 ? theme : (0, app_1.getRuntime)().theme;
                this.__offTheme = runtime.subscribe((snapshot) => this.setData(snapshot));
            },
            detached() {
                var _a;
                (_a = this.__offTheme) === null || _a === void 0 ? void 0 : _a.call(this);
                this.__offTheme = undefined;
            },
        },
        methods: {
            selectTab(input) {
                const index = readIndex(input);
                const slot = exports.TAB_SLOTS[index];
                if (!(slot === null || slot === void 0 ? void 0 : slot.pagePath) || slot.action)
                    return;
                const previous = this.data.selected;
                this.setData({ selected: index });
                try {
                    wx.switchTab({
                        url: `/${slot.pagePath}`,
                        success: () => this.setData({ selected: index }),
                        fail: () => this.setData({ selected: previous }),
                    });
                }
                catch (error) {
                    this.setData({ selected: previous });
                    throw error;
                }
            },
            openEntry() {
                if (this.data.openingEntry)
                    return;
                this.setData({ openingEntry: true });
                try {
                    wx.navigateTo({
                        url: '/pages/entry/index',
                        complete: () => this.setData({ openingEntry: false }),
                    });
                }
                catch (error) {
                    this.setData({ openingEntry: false });
                    throw error;
                }
            },
        },
    };
}
if (typeof Component !== 'undefined') {
    Component(createCustomTabBar());
}
