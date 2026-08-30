import { createEntryPage } from '../pages/entry/index';

test('entry chooser opens photo and manual entry flows', () => {
  const navigateTo = jest.fn();
  (globalThis as { wx?: unknown }).wx = { navigateTo };
  const page = createEntryPage();

  page.openPhoto();
  page.openManual();

  expect(navigateTo).toHaveBeenNthCalledWith(1, { url: '/pages/entry/photo/index' });
  expect(navigateTo).toHaveBeenNthCalledWith(2, { url: '/pages/ledger/edit/index' });
});
