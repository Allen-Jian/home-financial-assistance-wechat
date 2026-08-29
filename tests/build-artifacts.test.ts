import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

test('wechat build emits app and every configured page as javascript', () => {
  const app = require('../app.json') as { pages: string[] };
  expect(existsSync(resolve(__dirname, '../app.js'))).toBe(true);
  for (const page of app.pages) {
    expect(existsSync(resolve(__dirname, `../${page}.js`))).toBe(true);
  }
});
