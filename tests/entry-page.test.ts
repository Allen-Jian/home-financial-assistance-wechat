import { createEntryPage } from '../pages/entry/index';

test('entry chooser opens photo, manual, and bill-file flows', () => {
  const navigateTo = jest.fn();
  const navigateBack = jest.fn();
  (globalThis as { wx?: unknown }).wx = { navigateTo, navigateBack };
  const page = createEntryPage();

  page.openPhoto();
  page.openManual();
  page.openBillFile();
  page.close();

  expect(navigateTo).toHaveBeenNthCalledWith(1, { url: '/pages/entry/photo/index' });
  expect(navigateTo).toHaveBeenNthCalledWith(2, { url: '/pages/ledger/edit/index' });
  expect(navigateTo).toHaveBeenNthCalledWith(3, { url: '/pages/entry/photo/index?source=bill' });
  expect(navigateBack).toHaveBeenCalledTimes(1);
});
