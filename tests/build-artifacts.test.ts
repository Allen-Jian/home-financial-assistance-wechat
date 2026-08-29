import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

test('wechat build emits app and every configured page as javascript', () => {
  const app = require('../app.json') as { pages: string[] };
  expect(existsSync(resolve(__dirname, '../app.js'))).toBe(true);
  for (const page of app.pages) {
    expect(existsSync(resolve(__dirname, `../${page}.js`))).toBe(true);
  }
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
