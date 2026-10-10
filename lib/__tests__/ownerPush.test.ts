import { describe, it, expect, vi } from 'vitest';
import { createOwnerNotifier } from '../ownerPush';
import { memoryQuickDb } from './memoryQuickDb';

const MSG = { title: 'Priya says they have paid', body: '₹1,300.00 by UPI for INV-1.', data: { screen: 'payments-due' } };

describe('telling the owner\'s phone straight away', () => {
  it('sends to every phone the owner has switched on, and switches off one Expo says is gone', async () => {
    const mem = memoryQuickDb(() => 5);
    mem.seed('u1', 'devices', 'a', { token: 'ExponentPushToken[a]' });
    mem.seed('u1', 'devices', 'b', { token: 'ExponentPushToken[b]' });
    mem.seed('u1', 'devices', 'c', { token: 'ExponentPushToken[c]', disabled: true });
    const send = vi.fn().mockResolvedValue([{ ok: true }, { ok: false, invalidToken: true }]);
    await createOwnerNotifier({ db: mem.db, send, now: () => 5 })('u1', MSG);
    expect(send).toHaveBeenCalledWith([
      { to: 'ExponentPushToken[a]', ...MSG },
      { to: 'ExponentPushToken[b]', ...MSG },
    ]);
    expect(mem.read('u1', 'devices', 'b')).toMatchObject({ disabled: true, disabledAt: 5 });
    expect(mem.read('u1', 'devices', 'a')!.disabled).toBeUndefined();
  });

  it('sends nothing to an owner with no phone registered', async () => {
    const mem = memoryQuickDb();
    const send = vi.fn();
    await createOwnerNotifier({ db: mem.db, send, now: () => 1 })('u1', MSG);
    expect(send).not.toHaveBeenCalled();
  });
});
