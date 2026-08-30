declare const wx: { navigateTo(options: { url: string }): void };

export function createEntryPage() {
  return {
    openPhoto() { wx.navigateTo({ url: '/pages/entry/photo/index' }); },
    openManual() { wx.navigateTo({ url: '/pages/ledger/edit/index' }); },
  };
}

declare function Page(options: Record<string, unknown>): void;
if (typeof Page !== 'undefined') {
  Page(createEntryPage());
}
