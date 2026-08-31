import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

test('wechat build emits app and every configured page as javascript', () => {
  const app = require('../app.json') as { pages: string[] };
  expect(existsSync(resolve(__dirname, '../app.js'))).toBe(true);
  for (const page of app.pages) {
    expect(existsSync(resolve(__dirname, `../${page}.js`))).toBe(true);
  }
});

test('wechat build emits the shared themed page wrapper', () => {
  expect(existsSync(resolve(__dirname, '../src/shared/themed-page.js'))).toBe(true);
});

test('wechat build includes javascript for every registered custom component', () => {
  const app = require('../app.json') as { pages: string[] };

  for (const page of app.pages) {
    const config = require(resolve(__dirname, `../${page}.json`)) as {
      usingComponents?: Record<string, string>;
    };

    for (const componentPath of Object.values(config.usingComponents ?? {})) {
      const normalizedPath = componentPath.replace(/^\/+/, '');
      expect(existsSync(resolve(__dirname, `../${normalizedPath}.js`))).toBe(true);
    }
  }
});

test('global button layout centers labels independently of native button line-height', () => {
  const stylesheet = readFileSync(resolve(__dirname, '../app.wxss'), 'utf8');
  const sharedButtonRule = stylesheet.match(/\.primary-button,\s*\.secondary-button,\s*button\s*\{([^}]+)\}/)?.[1] ?? '';

  expect(sharedButtonRule).toMatch(/display:\s*flex/);
  expect(sharedButtonRule).toMatch(/align-items:\s*center/);
  expect(sharedButtonRule).toMatch(/justify-content:\s*center/);
});

test('every bottom navigation item ships normal and selected icons', () => {
  const app = require('../app.json') as {
    tabBar: { list: Array<{ iconPath?: string; selectedIconPath?: string }> };
  };

  expect(app.tabBar.list).toHaveLength(4);
  for (const item of app.tabBar.list) {
    for (const iconPath of [item.iconPath, item.selectedIconPath]) {
      expect(iconPath).toMatch(/^assets\/tabbar\/[a-z-]+\.png$/);
      const absolutePath = resolve(__dirname, '..', iconPath!);
      expect(existsSync(absolutePath)).toBe(true);
      expect(statSync(absolutePath).size).toBeLessThanOrEqual(40 * 1024);
    }
  }
});
