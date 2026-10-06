// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

const docs: any[] = [];
const select = vi.fn();
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collectionGroup: (name: string) => ({ select: (...fields: string[]) => { select(name, ...fields); return { get: async () => ({ docs }) }; } }) }),
}));

import { listUsersWithDevices } from '../notificationRoutes';

const device = (owner: string | null, parentCollection: string, disabled?: boolean) => ({
  ref: { parent: { parent: owner ? { id: owner, parent: { id: parentCollection } } : null } },
  get: (f: string) => (f === 'disabled' ? disabled : undefined),
});

describe('listUsersWithDevices', () => {
  it('lists each owner once, reading only the disabled flag', async () => {
    docs.length = 0;
    docs.push(device('u1', 'users'), device('u1', 'users'), device('u2', 'users'));
    expect((await listUsersWithDevices()).sort()).toEqual(['u1', 'u2']);
    expect(select).toHaveBeenCalledWith('devices', 'disabled');
  });

  it('leaves out an owner whose phones are all switched off, but keeps one with a working phone', async () => {
    docs.length = 0;
    docs.push(device('u1', 'users', true), device('u2', 'users', true), device('u2', 'users'));
    expect(await listUsersWithDevices()).toEqual(['u2']);
  });

  it('ignores a collection called devices that is not under a user', async () => {
    docs.length = 0;
    docs.push(device('shop1', 'shops'), device(null, 'users'), device('u1', 'users'));
    expect(await listUsersWithDevices()).toEqual(['u1']);
  });
});
