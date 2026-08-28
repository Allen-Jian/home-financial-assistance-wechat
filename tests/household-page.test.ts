import { HouseholdPageModel } from '../pages/household/index';

const members = [
  { membershipId: 'm-1', userId: 'u-1', username: 'alice', role: 'owner' as const, createdAt: '2026-08-01T00:00:00.000Z' },
  { membershipId: 'm-2', userId: 'u-2', username: 'bob', role: 'member' as const, createdAt: '2026-08-02T00:00:00.000Z' },
];

test('renders members and gates invite creation to the owner', async () => {
  const api = { fetchMembers: jest.fn().mockResolvedValue(members), createInvite: jest.fn().mockResolvedValue({ code: 'INVITE-1', expiresAt: '2026-09-01T00:00:00.000Z' }), removeMember: jest.fn() };
  const owner = new HouseholdPageModel(api, 'owner', () => undefined);
  await owner.load();
  expect(owner.state.members).toEqual(members);
  await expect(owner.createInvite(7)).resolves.toBe(true);
  expect(api.createInvite).toHaveBeenCalledWith(7);
  const member = new HouseholdPageModel(api, 'member', () => undefined);
  await expect(member.createInvite(7)).resolves.toBe(false);
  expect(api.createInvite).toHaveBeenCalledTimes(1);
});

test('requires confirmation for member removal and removes locally only after success', async () => {
  const api = { fetchMembers: jest.fn().mockResolvedValue(members), createInvite: jest.fn(), removeMember: jest.fn().mockResolvedValue({ status: 'removed' }) };
  const model = new HouseholdPageModel(api, 'owner', () => undefined);
  await model.load();
  expect(model.requestRemove('m-2')).toBe(false);
  expect(model.state.pendingRemovalId).toBe('m-2');
  expect(api.removeMember).not.toHaveBeenCalled();
  await expect(model.confirmRemove()).resolves.toBe(true);
  expect(api.removeMember).toHaveBeenCalledWith('m-2');
  expect(model.state.members).toHaveLength(1);
});

test('copies the one-time invite code through the supplied clipboard port', async () => {
  const api = { fetchMembers: jest.fn().mockResolvedValue(members), createInvite: jest.fn().mockResolvedValue({ code: 'INVITE-2', expiresAt: '2026-09-01T00:00:00.000Z' }), removeMember: jest.fn() };
  const copy = jest.fn().mockResolvedValue(undefined);
  const model = new HouseholdPageModel(api, 'owner', copy);
  await model.createInvite(1);
  await expect(model.copyInvite()).resolves.toBe(true);
  expect(copy).toHaveBeenCalledWith('INVITE-2');
});
