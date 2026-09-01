import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDashboardPage } from '../pages/dashboard/index';
import { createLedgerListPage } from '../pages/ledger/index';
import { createAiPage } from '../pages/ai/index';
import { createMorePage } from '../pages/more/index';

interface TabSlot { label: string; pagePath?: string }
interface CustomTabBarModule { createCustomTabBar(theme?: unknown): any; TAB_SLOTS: TabSlot[] }

function loadCustomTabBar(): CustomTabBarModule {
  const modulePath = resolve(__dirname, '../custom-tab-bar/index');
  expect(existsSync(`${modulePath}.ts`)).toBe(true);
  return require(modulePath) as CustomTabBarModule;
}

test('configures four real tabs while enabling the custom tab bar', () => {
  const app = JSON.parse(readFileSync(resolve(__dirname, '../app.json'), 'utf8')) as {
    tabBar?: { custom?: boolean; list?: Array<{ pagePath: string }> };
  };

  expect(app.tabBar?.custom).toBe(true);
  expect(app.tabBar?.list?.map((item) => item.pagePath)).toEqual([
    'pages/dashboard/index',
    'pages/ledger/index',
    'pages/ai/index',
    'pages/more/index',
  ]);
});

test('renders five fixed visual slots with the center action between real tabs', () => {
  const { TAB_SLOTS } = loadCustomTabBar();
  expect(TAB_SLOTS.map((slot) => slot.label)).toEqual(['首页', '账目', '记账', 'AI 聊天', '设置']);
  expect(TAB_SLOTS.map((slot) => slot.pagePath ?? null)).toEqual([
    'pages/dashboard/index', 'pages/ledger/index', null, 'pages/ai/index', 'pages/more/index',
  ]);

  const wxmlPath = resolve(__dirname, '../custom-tab-bar/index.wxml');
  expect(existsSync(wxmlPath)).toBe(true);
  const wxml = readFileSync(wxmlPath, 'utf8');
  expect(wxml).toContain('bindtap="selectTab"');
  expect(wxml).toContain('bindtap="openEntry"');
  expect(wxml).toContain('{{item.label}}');
});

test('switches ordinary slots and opens the entry route once for rapid center taps', () => {
  const { createCustomTabBar } = loadCustomTabBar();
  const switchTab = jest.fn();
  const navigateTo = jest.fn((options: { complete?: () => void }) => undefined);
  (globalThis as { wx?: unknown }).wx = { switchTab, navigateTo };
  const component = createCustomTabBar();
  const context = { data: { ...component.data }, setData: jest.fn() } as any;
  context.setData.mockImplementation((data: Record<string, unknown>) => Object.assign(context.data, data));

  component.methods.selectTab.call(context, { currentTarget: { dataset: { index: 1 } } });
  component.methods.selectTab.call(context, { currentTarget: { dataset: { index: 2 } } });
  component.methods.openEntry.call(context);
  component.methods.openEntry.call(context);

  expect(switchTab).toHaveBeenCalledWith({ url: '/pages/ledger/index' });
  expect(navigateTo).toHaveBeenCalledTimes(1);
  expect(navigateTo).toHaveBeenCalledWith({ url: '/pages/entry/index', complete: expect.any(Function) });
  expect(context.setData).toHaveBeenCalledWith({ selected: 1 });
});

test('releases the entry guard after completion and after a synchronous navigation throw', () => {
  const navigateTo = jest.fn();
  (globalThis as { wx?: unknown }).wx = { switchTab: jest.fn(), navigateTo };
  const component = loadCustomTabBar().createCustomTabBar();
  const context = { data: { ...component.data }, setData: jest.fn() } as any;
  context.setData.mockImplementation((data: Record<string, unknown>) => Object.assign(context.data, data));

  component.methods.openEntry.call(context);
  const firstOptions = navigateTo.mock.calls[0][0] as { complete?: () => void };
  firstOptions.complete?.();
  component.methods.openEntry.call(context);
  expect(navigateTo).toHaveBeenCalledTimes(2);
  const secondOptions = navigateTo.mock.calls[1][0] as { complete?: () => void };
  secondOptions.complete?.();

  navigateTo.mockImplementationOnce(() => { throw new Error('navigation failed'); });
  expect(() => component.methods.openEntry.call(context)).toThrow('navigation failed');
  component.methods.openEntry.call(context);
  expect(navigateTo).toHaveBeenCalledTimes(4);
});

test('custom tab bar subscribes to the shared theme runtime and releases it', () => {
  const { createCustomTabBar } = loadCustomTabBar();
  const offTheme = jest.fn();
  const snapshot = { themeClass: 'theme-dark', resolvedTheme: 'dark' };
  const theme = {
    getSnapshot: () => snapshot,
    subscribe: jest.fn((listener: (value: typeof snapshot) => void) => { listener(snapshot); return offTheme; }),
  };
  const component = createCustomTabBar(theme);
  const context = { data: { ...component.data }, setData: jest.fn() } as any;

  component.lifetimes.attached.call(context);
  component.lifetimes.detached.call(context);

  expect(theme.subscribe).toHaveBeenCalledTimes(1);
  expect(context.setData).toHaveBeenCalledWith(snapshot);
  expect(offTheme).toHaveBeenCalledTimes(1);
});

test('reserves custom tab space and maps fixed icons for dark mode', () => {
  const styles = [
    'pages/dashboard/index.wxss',
    'pages/ledger/index.wxss',
    'pages/ai/index.wxss',
    'pages/more/index.wxss',
  ].map((file) => readFileSync(resolve(__dirname, `../${file}`), 'utf8'));
  for (const [index, stylesheet] of styles.entries()) {
    const pageRules = [...stylesheet.matchAll(/\.(?:dashboard|ledger|ai|settings)-page\s*\{([^}]+)\}/g)].map((match) => match[1]);
    if (index !== 2) expect(pageRules.some((rule) => /padding-bottom:\s*calc\(\s*(?:1[4-9]\d|[2-9]\d\d)rpx\s*\+\s*env\(safe-area-inset-bottom\)\s*\)/.test(rule))).toBe(true);
  }

  const aiStyles = styles[2];
  const composerRules = [...aiStyles.matchAll(/\.composer\s*\{([^}]+)\}/g)].map((match) => match[1]);
  expect(composerRules.some((rule) => /bottom:\s*calc\([^}]*112rpx[^}]*env\(safe-area-inset-bottom\)/.test(rule))).toBe(true);
  const tabStyles = readFileSync(resolve(__dirname, '../custom-tab-bar/index.wxss'), 'utf8');
  expect(tabStyles).toMatch(/\.custom-tab-bar\.theme-dark\s*\{/);
  expect(tabStyles).toMatch(/\.theme-dark\s+\.tab-icon\s*\{[^}]*filter:\s*var\(--tab-icon-filter\)/s);
  expect(tabStyles).toMatch(/\.theme-dark\s+\.tab-icon\.selected\s*\{[^}]*filter:\s*var\(--tab-icon-selected-filter\)/s);
});

test('each main page marks its own visual tab when it is shown', async () => {
  const setData = jest.fn();
  const context = { setData: jest.fn(), getTabBar: () => ({ setData }) } as any;
  const period = { from: '2026-08-01', to: '2026-09-01' };

  await createDashboardPage({ load: jest.fn().mockResolvedValue(undefined), state: {} } as any).onShow.call(context);
  await createLedgerListPage({ currentPeriod: () => period, load: jest.fn().mockResolvedValue(undefined), state: {} } as any).onShow.call(context);
  await createAiPage({ hydrate: jest.fn().mockResolvedValue(undefined), state: {} } as any).onShow.call(context);
  const morePage = createMorePage({ exportTransactions: jest.fn(), logout: jest.fn() } as any) as any;
  expect(morePage.onShow).toEqual(expect.any(Function));
  if (typeof morePage.onShow !== 'function') return;
  await morePage.onShow.call(context);

  expect(setData).toHaveBeenNthCalledWith(1, { selected: 0 });
  expect(setData).toHaveBeenNthCalledWith(2, { selected: 1 });
  expect(setData).toHaveBeenNthCalledWith(3, { selected: 3 });
  expect(setData).toHaveBeenNthCalledWith(4, { selected: 4 });
});
