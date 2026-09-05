import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSet = vi.fn();
const mockGet = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockDoc = vi.fn(() => ({ set: mockSet, get: mockGet }));
const mockCollection = vi.fn(() => ({ doc: mockDoc, where: mockWhere }));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: mockCollection }),
}));

import { getBillingInfo, setBillingInfo, hasActiveAccess, findUidByStripeCustomerId } from '../subscriptionStore';

describe('subscriptionStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWhere.mockReturnValue({ limit: mockLimit });
  });

  describe('getBillingInfo', () => {
    it('returns default "none" status when the user has no billing field yet', async () => {
      mockGet.mockResolvedValueOnce({ data: () => ({}) });
      const info = await getBillingInfo('user1');
      expect(info.status).toBe('none');
      expect(info.stripeCustomerId).toBeNull();
    });

    it('returns the stored billing info merged over defaults', async () => {
      mockGet.mockResolvedValueOnce({
        data: () => ({ billing: { status: 'active', stripeCustomerId: 'cus_123' } }),
      });
      const info = await getBillingInfo('user1');
      expect(info.status).toBe('active');
      expect(info.stripeCustomerId).toBe('cus_123');
    });
  });

  describe('setBillingInfo', () => {
    it('merges the billing field onto the user document with an updatedAt timestamp', async () => {
      await setBillingInfo('user1', { status: 'active', stripeCustomerId: 'cus_123' });

      expect(mockCollection).toHaveBeenCalledWith('users');
      expect(mockDoc).toHaveBeenCalledWith('user1');
      expect(mockSet).toHaveBeenCalledTimes(1);
      const [payload, options] = mockSet.mock.calls[0];
      expect(payload.billing.status).toBe('active');
      expect(payload.billing.updatedAt).toBeTypeOf('number');
      expect(options).toEqual({ merge: true });
    });
  });

  describe('hasActiveAccess', () => {
    it('grants access for active and trialing', () => {
      expect(hasActiveAccess('active')).toBe(true);
      expect(hasActiveAccess('trialing')).toBe(true);
    });

    it('denies access for none, past_due, canceled, incomplete', () => {
      expect(hasActiveAccess('none')).toBe(false);
      expect(hasActiveAccess('past_due')).toBe(false);
      expect(hasActiveAccess('canceled')).toBe(false);
      expect(hasActiveAccess('incomplete')).toBe(false);
    });
  });

  describe('findUidByStripeCustomerId', () => {
    it('returns null when no user matches', async () => {
      mockLimit.mockReturnValue({ get: () => Promise.resolve({ empty: true, docs: [] }) });
      const uid = await findUidByStripeCustomerId('cus_unknown');
      expect(uid).toBeNull();
    });

    it('returns the matching user id', async () => {
      mockLimit.mockReturnValue({ get: () => Promise.resolve({ empty: false, docs: [{ id: 'user1' }] }) });
      const uid = await findUidByStripeCustomerId('cus_123');
      expect(uid).toBe('user1');
      expect(mockWhere).toHaveBeenCalledWith('billing.stripeCustomerId', '==', 'cus_123');
    });
  });
});
