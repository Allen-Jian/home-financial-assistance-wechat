import { ManualEntryPageModel } from '../pages/ledger/edit/index';

test('manual entry sends no accountId', async () => {
  const createTransaction = jest.fn().mockResolvedValue({ id: 'tx-1' });
  const model = new ManualEntryPageModel({
    createTransaction,
    fetchCategories: jest.fn().mockResolvedValue([
      { id: 'c-1', name: '餐饮', direction: 'expense', active: true },
    ]),
  }, () => 'idem-1');
  model.setAmount('18.90');
  model.setCategory('c-1');

  await expect(model.submit()).resolves.toBe(true);

  expect(createTransaction).toHaveBeenCalledWith(expect.not.objectContaining({ accountId: expect.anything() }));
  expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({
    direction: 'expense', amountMinor: 1890, categoryId: 'c-1', idempotencyKey: 'idem-1',
  }));
});

test('manual entry loads only active categories', async () => {
  const model = new ManualEntryPageModel({
    createTransaction: jest.fn(),
    fetchCategories: jest.fn().mockResolvedValue([
      { id: 'c-1', name: '餐饮', direction: 'expense', active: true },
      { id: 'c-2', name: '旧分类', direction: 'expense', active: false },
    ]),
  });

  await model.load();

  expect(model.state.categories).toEqual([
    { id: 'c-1', name: '餐饮', direction: 'expense', active: true },
  ]);
});

test('manual entry rejects a non-positive amount and invalid date', async () => {
  const createTransaction = jest.fn();
  const model = new ManualEntryPageModel({ createTransaction, fetchCategories: jest.fn().mockResolvedValue([]) });

  model.setAmount('0');
  await expect(model.submit()).resolves.toBe(false);
  expect(createTransaction).not.toHaveBeenCalled();

  model.setAmount('1.00');
  model.setDate('not-a-date');
  await expect(model.submit()).resolves.toBe(false);
  expect(createTransaction).not.toHaveBeenCalled();
});
