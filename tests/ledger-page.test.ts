import { ApiError } from '../src/api/client';
import { LedgerPageModel } from '../pages/ledger/index';

test('rejects non-positive amounts and missing accounts before calling the API', async () => {
  const createTransaction = jest.fn();
  const model = new LedgerPageModel({ createTransaction }, () => 'idem-1');
  model.setAmount('0');
  await expect(model.submit()).resolves.toBe(false);
  model.setAmount('12.50');
  await expect(model.submit()).resolves.toBe(false);
  expect(createTransaction).not.toHaveBeenCalled();
  expect(model.state.error).toContain('账户');
});

test('sends integer NZ cents, selected category, UTC date, and an idempotency key', async () => {
  const createTransaction = jest.fn().mockResolvedValue({ id: 'transaction-1' });
  const model = new LedgerPageModel({ createTransaction }, () => 'idem-2');
  model.setDirection('expense');
  model.setAmount('86.40');
  model.setAccount('account-1');
  model.setCategory('category-1');
  model.setDate('2026-08-15');
  model.setNote('家庭晚餐');
  await expect(model.submit()).resolves.toBe(true);
  expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({
    direction: 'expense', amountMinor: 8640, accountId: 'account-1', categoryId: 'category-1',
    occurredAt: '2026-08-15T00:00:00.000Z', note: '家庭晚餐', idempotencyKey: 'idem-2',
  }));
});

test('turns a duplicate conflict into two explicit human choices', async () => {
  const duplicate = new ApiError(409, 'duplicate', 'duplicate candidates found', { candidates: [{ existingId: 'old-1' }] });
  const createTransaction = jest.fn().mockRejectedValueOnce(duplicate).mockResolvedValueOnce({ id: 'transaction-2' }).mockRejectedValueOnce(duplicate);
  const model = new LedgerPageModel({ createTransaction }, () => 'idem-3');
  model.setAmount('10');
  model.setAccount('account-1');
  await expect(model.submit()).resolves.toBe(false);
  expect(model.state.duplicateActions).toEqual(['稍后处理', '保留两笔']);
  await expect(model.chooseDuplicate('keep-both')).resolves.toBe(true);
  expect(createTransaction).toHaveBeenLastCalledWith(expect.objectContaining({ allowDuplicate: true }));
  await expect(model.submit()).resolves.toBe(false);
  await expect(model.chooseDuplicate('later')).resolves.toBe(false);
  expect(createTransaction).toHaveBeenCalledTimes(3);
});
