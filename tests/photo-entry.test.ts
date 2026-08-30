import { PhotoEntryPageModel } from '../pages/entry/photo/index';

test('AI failure keeps the original selected file', async () => {
  const model = new PhotoEntryPageModel({ parseDraft: jest.fn().mockRejectedValue(new Error('AI unavailable')) });

  await expect(model.analyze({ path: '/tmp/receipt.jpg', name: 'receipt.jpg' })).resolves.toBe(false);

  expect(model.state.originalPreserved).toBe(true);
  expect(model.state.file).toEqual({ path: '/tmp/receipt.jpg', name: 'receipt.jpg' });
});

test('photo analysis does not confirm until the user presses confirm', async () => {
  const parseDraft = jest.fn().mockResolvedValue({ amountMinor: 1890, direction: 'expense', occurredAt: '2026-08-30' });
  const createTransaction = jest.fn().mockResolvedValue({ id: 'tx-1' });
  const model = new PhotoEntryPageModel({ parseDraft, createTransaction });

  await expect(model.analyze({ path: '/tmp/receipt.jpg', name: 'receipt.jpg' })).resolves.toBe(true);
  expect(createTransaction).not.toHaveBeenCalled();

  await expect(model.confirm()).resolves.toBe(true);
  expect(createTransaction).toHaveBeenCalledWith(expect.not.objectContaining({ accountId: expect.anything() }));
});

test('photo draft can be edited before confirmation', async () => {
  const parseDraft = jest.fn().mockResolvedValue({ amountMinor: 1890, direction: 'expense' });
  const createTransaction = jest.fn().mockResolvedValue({ id: 'tx-1' });
  const model = new PhotoEntryPageModel({ parseDraft, createTransaction });

  await model.analyze({ path: '/tmp/receipt.jpg', name: 'receipt.jpg' });
  model.updateDraft({ amountMinor: 2000, note: '补充备注' });
  await model.confirm();

  expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 2000, note: '补充备注' }));
});

test('confirms staged photos with edited fields and no accountId', async () => {
  const parseDraft = jest.fn().mockResolvedValue({ amountMinor: 1890, direction: 'expense' });
  const stageImport = jest.fn().mockResolvedValue({ draftId: 'draft-1', reused: false });
  const confirmDraft = jest.fn().mockResolvedValue({ id: 'tx-1' });
  const model = new PhotoEntryPageModel({ parseDraft, stageImport, confirmDraft });

  await model.analyze({ path: '/tmp/receipt.jpg', name: 'receipt.jpg' });
  model.updateDraft({ amountMinor: 2000, note: '改过的备注' });
  await expect(model.confirm()).resolves.toBe(true);

  expect(stageImport).toHaveBeenCalledWith(expect.objectContaining({
    draft: expect.objectContaining({ amountMinor: 1890 }),
  }));
  expect(confirmDraft).toHaveBeenCalledWith('draft-1', expect.objectContaining({
    amountMinor: 2000, note: '改过的备注',
  }));
  expect(confirmDraft).toHaveBeenCalledWith('draft-1', expect.not.objectContaining({ accountId: expect.anything() }));
});

test('offers retry after AI failure without losing the selected file', async () => {
  const parseDraft = jest.fn()
    .mockRejectedValueOnce(new Error('AI unavailable'))
    .mockResolvedValueOnce({ amountMinor: 1890, direction: 'expense' });
  const model = new PhotoEntryPageModel({ parseDraft });
  const file = { path: '/tmp/receipt.jpg', name: 'receipt.jpg' };

  await expect(model.analyze(file)).resolves.toBe(false);
  await expect(model.retry()).resolves.toBe(true);

  expect(model.state.file).toEqual(file);
  expect(model.state.originalPreserved).toBe(true);
});
