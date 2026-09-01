import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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

test('all theme and tab icon assets exist and are tracked at HEAD', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'app.json'), 'utf8')) as {
    themeLocation?: string;
    tabBar?: { list?: Array<{ iconPath?: string; selectedIconPath?: string }> };
  };
  const references = [
    appConfig.themeLocation,
    ...(appConfig.tabBar?.list ?? []).flatMap((item) => [item.iconPath, item.selectedIconPath]),
  ].filter((value): value is string => Boolean(value));

  for (const relativePath of references) {
    expect(fs.existsSync(path.join(process.cwd(), relativePath))).toBe(true);
    const tracked = spawnSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', '--', relativePath], { encoding: 'utf8' });
    expect(tracked.status).toBe(0);
    expect(tracked.stdout.trim().split(/\r?\n/)).toContain(relativePath);
  }
});

test('the custom tab labels use the spaced AI chat label', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'app.json'), 'utf8')) as {
    tabBar?: { list?: Array<{ text: string }> };
  };
  expect(appConfig.tabBar?.list?.map((item) => item.text)).toContain('AI 聊天');
});
