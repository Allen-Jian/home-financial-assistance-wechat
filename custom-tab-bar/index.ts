import { getRuntime } from '../app';
import type { ThemeSnapshot } from '../src/shared/theme-runtime';
import type { ThemePageRuntime } from '../src/shared/themed-page';

export interface TabSlot {
  label: string;
  pagePath?: string;
  icon?: string;
  selectedIcon?: string;
  action?: 'entry';
}

export const TAB_SLOTS: TabSlot[] = [
  { label: '首页', pagePath: 'pages/dashboard/index', icon: '/assets/tabbar/home.png', selectedIcon: '/assets/tabbar/home-selected.png' },
  { label: '账目', pagePath: 'pages/ledger/index', icon: '/assets/tabbar/ledger.png', selectedIcon: '/assets/tabbar/ledger-selected.png' },
  { label: '记账', action: 'entry' },
  { label: 'AI 聊天', pagePath: 'pages/ai/index', icon: '/assets/tabbar/ai.png', selectedIcon: '/assets/tabbar/ai-selected.png' },
  { label: '设置', pagePath: 'pages/more/index', icon: '/assets/tabbar/settings.png', selectedIcon: '/assets/tabbar/settings-selected.png' },
];

interface TabBarContext {
  data: { selected: number; openingEntry: boolean } & Record<string, unknown>;
  setData(data: unknown): void;
  __offTheme?: () => void;
}

interface TabTapEvent { currentTarget?: { dataset?: { index?: unknown } } }

function readIndex(input: number | TabTapEvent): number {
  if (typeof input === 'number') return input;
  const value = input.currentTarget?.dataset?.index;
  return typeof value === 'number' ? value : Number(value);
}

export function createCustomTabBar(theme?: ThemePageRuntime) {
  return {
    data: {
      slots: TAB_SLOTS,
      selected: 0,
      openingEntry: false,
      ...(theme?.getSnapshot() ?? {}),
    },
    lifetimes: {
      attached(this: TabBarContext) {
        const runtime = theme ?? getRuntime().theme;
        this.__offTheme = runtime.subscribe((snapshot: ThemeSnapshot) => this.setData(snapshot));
      },
      detached(this: TabBarContext) {
        this.__offTheme?.();
        this.__offTheme = undefined;
      },
    },
    methods: {
      selectTab(this: TabBarContext, input: number | TabTapEvent) {
        const index = readIndex(input);
        const slot = TAB_SLOTS[index];
        if (!slot?.pagePath || slot.action) return;
        this.setData({ selected: index });
        wx.switchTab({ url: `/${slot.pagePath}` });
      },
      openEntry(this: TabBarContext) {
        if (this.data.openingEntry) return;
        this.setData({ openingEntry: true });
        try {
          wx.navigateTo({
            url: '/pages/entry/index',
            complete: () => this.setData({ openingEntry: false }),
          });
        } catch (error) {
          this.setData({ openingEntry: false });
          throw error;
        }
      },
    },
  };
}

declare const wx: {
  switchTab(options: { url: string }): void;
  navigateTo(options: { url: string; complete?: () => void }): void;
};
declare function Component(options: Record<string, unknown>): void;

if (typeof Component !== 'undefined') {
  Component(createCustomTabBar());
}
