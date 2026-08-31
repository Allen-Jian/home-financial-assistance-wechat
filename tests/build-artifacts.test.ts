import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ts from 'typescript';

function normalize(value: string): string {
  return value.replace(/\r\n/g, '\n').trim();
}

function projectCompilerOptions(): ts.CompilerOptions {
  const configPath = resolve(__dirname, '../tsconfig.miniprogram.json');
  const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
  if (readResult.error) throw new Error(ts.flattenDiagnosticMessageText(readResult.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(readResult.config, ts.sys, resolve(__dirname, '..'));
  if (parsed.errors.length) throw new Error(ts.flattenDiagnosticMessageText(parsed.errors[0].messageText, '\n'));
  return parsed.options;
}

function transpile(source: string, compilerOptions: ts.CompilerOptions): string {
  return ts.transpileModule(source, {
    compilerOptions,
  }).outputText;
}

test('wechat build emits app and every configured page as javascript', () => {
  const app = require('../app.json') as { pages: string[] };
  expect(existsSync(resolve(__dirname, '../app.js'))).toBe(true);
  for (const page of app.pages) {
    expect(existsSync(resolve(__dirname, `../${page}.js`))).toBe(true);
  }
});

test('wechat build keeps every themed page and wrapper JS artifact in sync with TS', () => {
  const app = require('../app.json') as { pages: string[] };
  const sources = [...app.pages.map((page) => `${page}`), 'src/shared/themed-page'];
  const compilerOptions = projectCompilerOptions();

  for (const source of sources) {
    const tsPath = resolve(__dirname, `../${source}.ts`);
    const jsPath = resolve(__dirname, `../${source}.js`);
    expect(existsSync(jsPath)).toBe(true);
    expect(normalize(readFileSync(jsPath, 'utf8'))).toBe(normalize(transpile(readFileSync(tsPath, 'utf8'), compilerOptions)));
  }
});

test('artifact transpilation honors the project default-import interop option', () => {
  const compilerOptions = projectCompilerOptions();
  const fixture = "import value from 'fixture'; export const result = value;";
  const emitted = transpile(fixture, compilerOptions);

  expect(compilerOptions.esModuleInterop).toBe(true);
  expect(emitted).toMatch(/__importDefault/);
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
