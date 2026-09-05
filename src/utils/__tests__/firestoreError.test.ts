import { describe, it, expect, vi } from 'vitest';

vi.mock('../../firebase', () => ({
  auth: { currentUser: { uid: 'user1', email: 'baker@example.com', emailVerified: true, isAnonymous: false, tenantId: null, providerData: [] } },
}));

import { handleFirestoreError, OperationType } from '../firestoreError';

describe('handleFirestoreError', () => {
  it('always throws, embedding the operation type and path in the message', () => {
    expect(() => handleFirestoreError(new Error('boom'), OperationType.WRITE, 'users/user1/materials/1'))
      .toThrow();

    try {
      handleFirestoreError(new Error('boom'), OperationType.WRITE, 'users/user1/materials/1');
    } catch (e: any) {
      const parsed = JSON.parse(e.message);
      expect(parsed.error).toBe('boom');
      expect(parsed.operationType).toBe('write');
      expect(parsed.path).toBe('users/user1/materials/1');
      expect(parsed.authInfo.userId).toBe('user1');
    }
  });

  it('stringifies non-Error thrown values', () => {
    try {
      handleFirestoreError('a plain string error', OperationType.DELETE, null);
    } catch (e: any) {
      const parsed = JSON.parse(e.message);
      expect(parsed.error).toBe('a plain string error');
      expect(parsed.path).toBeNull();
    }
  });
});
