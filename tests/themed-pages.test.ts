import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ts from 'typescript';
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

function rootAfterThemeMeta(wxml: string): { tag: string; classAttribute: string } | null {
  const afterMeta = wxml.trimStart().replace(/^<page-meta\s+page-style="\{\{themePageStyle\}\}"\s*\/>/, '').trimStart();
  const root = afterMeta.match(/^<([a-z][\w-]*)\b([^>]*)>/i);
  const classAttribute = root?.[2].match(/(?:^|\s)class\s*=\s*"([^"]*)"/i)?.[1] ?? '';
  return root ? { tag: root[1], classAttribute } : null;
}

function hasPageThemeWrapper(source: string, scriptKind: ts.ScriptKind): boolean {
  const file = ts.createSourceFile('page-source', source, ts.ScriptTarget.Latest, true, scriptKind);
  let found = false;
  const isThemeCall = (expression: ts.Expression): boolean => {
    let current = expression;
    while (ts.isParenthesizedExpression(current)) current = current.expression;
    if (ts.isIdentifier(current)) return current.text === 'withThemePage';
    if (ts.isPropertyAccessExpression(current)) return current.name.text === 'withThemePage';
    if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.CommaToken) {
      return isThemeCall(current.right);
    }
    return false;
  };
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'Page'
      && node.arguments.length > 0
      && ts.isCallExpression(node.arguments[0])
      && isThemeCall(node.arguments[0].expression)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

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

test('every configured page registers the themed wrapper in TS and generated JS', () => {
  const app = require('../app.json') as { pages: string[] };

  for (const page of app.pages) {
    const source = readFileSync(resolve(__dirname, `../${page}.ts`), 'utf8');
    const generated = readFileSync(resolve(__dirname, `../${page}.js`), 'utf8');
    expect(hasPageThemeWrapper(source, ts.ScriptKind.TS)).toBe(true);
    expect(hasPageThemeWrapper(generated, ts.ScriptKind.JS)).toBe(true);
  }
});

test('AST registration assertion ignores comments and string literals', () => {
  const fixture = '// Page(withThemePage(createPage()))\nconst text = "Page(withThemePage(createPage()))"; Page({});';
  expect(hasPageThemeWrapper(fixture, ts.ScriptKind.TS)).toBe(false);
  expect(hasPageThemeWrapper(fixture, ts.ScriptKind.JS)).toBe(false);
});

test('every configured page starts with page-meta and binds themeClass on its root', () => {
  const app = require('../app.json') as { pages: string[] };

  for (const page of app.pages) {
    const wxml = readFileSync(resolve(__dirname, `../${page}.wxml`), 'utf8');
    const firstNode = wxml.trimStart().match(/^<page-meta\s+page-style="\{\{themePageStyle\}\}"\s*\/>/);
    expect(firstNode?.[0]).toBe('<page-meta page-style="{{themePageStyle}}" />');
    expect(rootAfterThemeMeta(wxml)).toEqual(expect.objectContaining({ tag: 'view' }));
    expect(rootAfterThemeMeta(wxml)?.classAttribute).toContain('{{themeClass}}');
  }
});

test('root theme assertion does not accept a nested-only themeClass binding', () => {
  const fixture = '<page-meta page-style="{{themePageStyle}}" /><view class="page"><view class="{{themeClass}}" /></view>';
  expect(rootAfterThemeMeta(fixture)?.classAttribute).not.toContain('{{themeClass}}');
});

test('root theme assertion requires the class attribute itself', () => {
  const fixture = '<page-meta page-style="{{themePageStyle}}" /><view data-theme="{{themeClass}}" />';
  expect(rootAfterThemeMeta(fixture)?.classAttribute).not.toContain('{{themeClass}}');
});

test('root theme assertion does not treat data-class as class', () => {
  const fixture = '<page-meta page-style="{{themePageStyle}}" /><view data-class="{{themeClass}}" />';
  expect(rootAfterThemeMeta(fixture)?.classAttribute).not.toContain('{{themeClass}}');
});
