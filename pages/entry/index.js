"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEntryPage = createEntryPage;
function createEntryPage() {
    return {
        openPhoto() { wx.navigateTo({ url: '/pages/entry/photo/index' }); },
        openManual() { wx.navigateTo({ url: '/pages/ledger/edit/index' }); },
    };
}
if (typeof Page !== 'undefined') {
    Page(createEntryPage());
}
