"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEntryPage = createEntryPage;
const app_1 = require("../../app");
const themed_page_1 = require("../../src/shared/themed-page");
function createEntryPage() {
    return {
        openPhoto() { wx.navigateTo({ url: '/pages/entry/photo/index' }); },
        openManual() { wx.navigateTo({ url: '/pages/ledger/edit/index' }); },
        openBillFile() { wx.navigateTo({ url: '/pages/entry/photo/index?source=bill' }); },
        close() { wx.navigateBack({ delta: 1 }); },
    };
}
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
    Page((0, themed_page_1.withThemePage)(createEntryPage(), (0, app_1.getRuntime)().theme));
}
