import { describe, it, expect, vi } from 'vitest';
import { invoicePath, requestInvoice } from '../invoice';

describe('invoice', () => {
  it('asks for the invoice of one order, with the id made safe for a path', async () => {
    expect(invoicePath('abc123')).toBe('/api/mobile/orders/abc123/invoice');
    expect(invoicePath('a/b c')).toBe('/api/mobile/orders/a%2Fb%20c/invoice');
    const answer = { orderIds: ['abc123'], balanceDue: 0, shareMessage: 'Paid in full. Thank you!', whatsappUrl: null };
    const api = { post: vi.fn().mockResolvedValue(answer) };
    await expect(requestInvoice(api, 'abc123')).resolves.toEqual(answer);
    expect(api.post).toHaveBeenCalledWith('/api/mobile/orders/abc123/invoice');
  });

  it('lets the failure through, for the button to explain', async () => {
    const api = { post: vi.fn().mockRejectedValue(new Error('offline')) };
    await expect(requestInvoice(api, 'a')).rejects.toThrow('offline');
  });
});
