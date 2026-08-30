import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEntryPage } from '../pages/entry/index';

test('quick entry copy does not promise album selection', () => {
  const wxml = readFileSync(resolve(__dirname, '../pages/entry/index.wxml'), 'utf8');

  expect(wxml).toContain('拍照，AI 帮你生成草稿');
  expect(wxml).not.toContain('拍照或从相册选图');
});

test('entry chooser opens photo and manual entry flows', () => {
  const navigateTo = jest.fn();
  (globalThis as { wx?: unknown }).wx = { navigateTo };
  const page = createEntryPage();

  page.openPhoto();
  page.openManual();

  expect(navigateTo).toHaveBeenNthCalledWith(1, { url: '/pages/entry/photo/index' });
  expect(navigateTo).toHaveBeenNthCalledWith(2, { url: '/pages/ledger/edit/index' });
});
