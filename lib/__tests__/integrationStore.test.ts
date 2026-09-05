import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSet = vi.fn();
const mockGet = vi.fn();
const mockDelete = vi.fn();
const mockDoc = vi.fn(() => ({ set: mockSet, get: mockGet, delete: mockDelete, collection: mockCollection }));
const mockCollection = vi.fn(() => ({ doc: mockDoc }));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: mockCollection }),
}));

process.env.SESSION_ENC_KEY = 'test-key-for-unit-tests-only';

import { saveCredentials, getCredentials, deleteCredentials } from '../integrationStore';

describe('integrationStore (Firestore-backed)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saveCredentials writes to users/{uid}/integrationCredentials/{provider}, encrypted', async () => {
    await saveCredentials('user1', 'shopify', { accessToken: 'secret-token', shop: 'my-shop.myshopify.com' });

    // Path construction: users/user1 -> integrationCredentials/shopify
    expect(mockCollection).toHaveBeenNthCalledWith(1, 'users');
    expect(mockDoc).toHaveBeenNthCalledWith(1, 'user1');
    expect(mockCollection).toHaveBeenNthCalledWith(2, 'integrationCredentials');
    expect(mockDoc).toHaveBeenNthCalledWith(2, 'shopify');

    expect(mockSet).toHaveBeenCalledTimes(1);
    const [payload] = mockSet.mock.calls[0];
    // The stored blob must not contain the plaintext secret anywhere.
    expect(JSON.stringify(payload)).not.toContain('secret-token');
    expect(typeof payload.data).toBe('string');
    expect(payload.updatedAt).toBeTypeOf('number');
  });

  it('getCredentials returns null when no document exists', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });
    const result = await getCredentials('user1', 'odoo');
    expect(result).toBeNull();
  });

  it('getCredentials decrypts and returns the original data after a round trip through saveCredentials', async () => {
    const original = { url: 'https://my-odoo.example.com', db: 'main', username: 'admin', password: 'hunter2' };

    await saveCredentials('user1', 'odoo', original);
    const [savedPayload] = mockSet.mock.calls[0];

    mockGet.mockResolvedValueOnce({ exists: true, data: () => savedPayload });
    const result = await getCredentials<typeof original>('user1', 'odoo');

    expect(result).toEqual(original);
  });

  it('deleteCredentials deletes the correct document', async () => {
    await deleteCredentials('user1', 'shopify');
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDoc).toHaveBeenNthCalledWith(2, 'shopify');
  });
});
