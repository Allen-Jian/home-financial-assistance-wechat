import { createManualEntryPage, ManualEntryPageModel } from '../pages/ledger/edit/index';

test('manual entry exposes one icon close action', () => {
  const navigateBack = jest.fn();
  (globalThis as { wx?: unknown }).wx = { navigateBack };
  const page = createManualEntryPage(new ManualEntryPageModel({ createTransaction: jest.fn() }));

  page.close();

  expect(navigateBack).toHaveBeenCalledTimes(1);
});

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

test('manual entry filters category buttons by direction and saves a merchant', async () => {
  const createTransaction = jest.fn().mockResolvedValue({ id: 'tx-1' });
  const model = new ManualEntryPageModel({
    createTransaction,
    fetchCategories: jest.fn().mockResolvedValue([
      { id: 'expense-1', name: '餐饮', direction: 'expense', active: true },
      { id: 'income-1', name: '工资', direction: 'income', active: true },
    ]),
  }, () => 'idem-merchant');
  await model.load();
  expect(model.state.visibleCategories.map((item) => item.name)).toEqual(['餐饮']);
  model.setDirection('income');
  model.setAmount('100.00');
  model.setCategory('income-1');
  model.setMerchant('工资');

  await expect(model.submit()).resolves.toBe(true);
  expect(model.state.visibleCategories.map((item) => item.name)).toEqual(['工资']);
  expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({ merchant: '工资' }));
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

test('manual entry ignores a second submit while the first write is in flight', async () => {
  let finish!: (value: { id: string }) => void;
  const createTransaction = jest.fn().mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const model = new ManualEntryPageModel({ createTransaction }, () => 'idem-one');
  model.setAmount('12.50');

  const first = model.submit();
  const second = model.submit();

  await expect(second).resolves.toBe(false);
  expect(createTransaction).toHaveBeenCalledTimes(1);
  finish({ id: 'tx-1' });
  await expect(first).resolves.toBe(true);
});
