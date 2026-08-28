import { ApiError } from '../src/api/client';
import { DraftReviewPageModel } from '../pages/drafts/index';

const draft = { id: 'draft-1', direction: 'expense' as const, amountMinor: 1250, status: 'pending' as const, occurredAt: '2026-08-15T00:00:00.000Z', merchant: 'Market', note: '周末采购', rawPayload: { sourceFileName: 'receipt.jpg' } };

test('requires an account before confirming the current draft', async () => {
  const api = { fetchPendingDrafts: jest.fn().mockResolvedValue([draft]), confirmDraft: jest.fn() };
  const model = new DraftReviewPageModel(api);
  await model.load();
  await expect(model.confirm()).resolves.toBe(false);
  expect(model.state.error).toContain('账户');
  expect(api.confirmDraft).not.toHaveBeenCalled();
});

test('keeps a duplicate candidate until the server accepts the chosen action', async () => {
  const conflict = new ApiError(409, 'duplicate', 'draft has duplicate candidates', { candidates: [{ existingId: 'tx-1', reasons: ['金额相同'] }] });
  const api = { fetchPendingDrafts: jest.fn().mockResolvedValue([draft]), confirmDraft: jest.fn().mockRejectedValueOnce(conflict).mockResolvedValueOnce({ id: 'tx-2' }) };
  const model = new DraftReviewPageModel(api);
  await model.load();
  model.setAccount('account-1');
  await expect(model.confirm()).resolves.toBe(false);
  expect(model.state.duplicateActions).toEqual(['稍后处理', '保留两笔']);
  expect(model.state.drafts).toHaveLength(1);
  await expect(model.chooseDuplicate('keep-both')).resolves.toBe(true);
  expect(api.confirmDraft).toHaveBeenLastCalledWith('draft-1', { accountId: 'account-1', allowDuplicate: true });
  expect(model.state.drafts).toHaveLength(0);
});

test('later leaves the draft pending without a destructive client-side removal', async () => {
  const api = { fetchPendingDrafts: jest.fn().mockResolvedValue([draft]), confirmDraft: jest.fn() };
  const model = new DraftReviewPageModel(api);
  await model.load();
  await expect(model.chooseDuplicate('later')).resolves.toBe(false);
  expect(model.state.drafts).toHaveLength(1);
  expect(api.confirmDraft).not.toHaveBeenCalled();
});
