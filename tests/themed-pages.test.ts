import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withThemePage, type ThemePageRuntime } from '../src/shared/themed-page';

const snapshot = {
  preference: 'system' as const,
  themePreference: 'system' as const,
  resolvedTheme: 'light' as const,
  themeClass: 'theme-light',
  themeBackground: '#FBF7F0',
  themePageStyle: 'background-color: #FBF7F0;',
  tokens: {} as never,
};

test('provides a themed page lifecycle wrapper', () => {
  const modulePath = resolve(__dirname, '../src/shared/themed-page.ts');
  expect(existsSync(modulePath)).toBe(true);
});

test('composes existing lifecycle methods and disposes its subscription once', () => {
  const offTheme = jest.fn();
  const subscribe = jest.fn((listener: (value: typeof snapshot) => void) => {
    listener(snapshot);
    return offTheme;
  });
  const theme: ThemePageRuntime = {
    getSnapshot: () => snapshot,
    subscribe,
  };
  const onLoad = jest.fn(() => 'loaded');
  const onShow = jest.fn(() => 'shown');
  const onUnload = jest.fn(() => 'unloaded');
  const definition = { data: { existing: true }, onLoad, onShow, onUnload };
  const wrapped = withThemePage(definition, theme);
  const setData = jest.fn();
  const context = { setData };

  expect((wrapped.onLoad as Function).call(context, 'arg')).toBe('loaded');
  expect((wrapped.onShow as Function).call(context)).toBe('shown');
  expect((wrapped.onUnload as Function).call(context)).toBe('unloaded');
  (wrapped.onUnload as Function).call(context);

  expect(wrapped.data).toMatchObject({ existing: true, themeClass: 'theme-light' });
  expect(setData).toHaveBeenCalledWith(snapshot);
  expect(onLoad).toHaveBeenCalledWith('arg');
  expect(onShow).toHaveBeenCalledTimes(1);
  expect(onUnload).toHaveBeenCalledTimes(2);
  expect(offTheme).toHaveBeenCalledTimes(1);
});

test('every configured page starts with page-meta bound to themePageStyle', () => {
  const app = require('../app.json') as { pages: string[] };

  for (const page of app.pages) {
    const wxml = readFileSync(resolve(__dirname, `../${page}.wxml`), 'utf8');
    const firstNode = wxml.trimStart().match(/^<page-meta\s+page-style="\{\{themePageStyle\}\}"\s*\/>/);
    expect(firstNode?.[0]).toBe('<page-meta page-style="{{themePageStyle}}" />');
    expect(wxml).toMatch(/class="[^"]*\{\{themeClass\}\}/);
  }
});
