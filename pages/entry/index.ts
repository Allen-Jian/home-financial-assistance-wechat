import { getRuntime } from '../../app';
import { withThemePage } from '../../src/shared/themed-page';

declare const wx: { navigateTo(options: { url: string }): void; navigateBack(options?: { delta?: number }): void };

export function createEntryPage() {
  return {
    openPhoto() { wx.navigateTo({ url: '/pages/entry/photo/index' }); },
    openManual() { wx.navigateTo({ url: '/pages/ledger/edit/index' }); },
    openBillFile() { wx.navigateTo({ url: '/pages/entry/photo/index?source=bill' }); },
    close() { wx.navigateBack({ delta: 1 }); },
  };
}

declare function Page(options: Record<string, unknown>): void;
declare function getApp<T>(): T;
if (typeof Page !== 'undefined' && typeof getApp !== 'undefined') {
  Page(withThemePage(createEntryPage(), getRuntime().theme));
}
