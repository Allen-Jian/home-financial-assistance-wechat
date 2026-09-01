import fs from 'node:fs';
import path from 'node:path';

test('app.json only declares permission keys accepted by WeChat', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'app.json'), 'utf8')) as {
    permission?: Record<string, unknown>;
  };

  expect(Object.keys(appConfig.permission ?? {})).not.toContain('scope.camera');
});

test('app.json enables the custom tab bar while retaining exactly four real tab pages', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'app.json'), 'utf8')) as {
    tabBar?: { custom?: boolean; list?: Array<{ pagePath: string }> };
  };

  expect(appConfig.tabBar?.custom).toBe(true);
  expect(appConfig.tabBar?.list?.map((item) => item.pagePath)).toEqual([
    'pages/dashboard/index', 'pages/ledger/index', 'pages/ai/index', 'pages/more/index',
  ]);
});
