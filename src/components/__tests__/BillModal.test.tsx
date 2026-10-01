import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiFetch = vi.fn();
vi.mock('../../utils/apiClient', () => ({ apiFetch: (...a: any[]) => apiFetch(...a) }));
vi.mock('html2canvas', () => ({
  default: vi.fn(async () => ({ toBlob: (cb: (b: Blob) => void) => cb(new Blob(['png'], { type: 'image/png' })) })),
}));

import { BillModal } from '../BillModal';

const TOKEN = 'a'.repeat(32);
const menu: any[] = [{ id: 'cake', name: 'Chocolate Cake', sellingPrice: 500 }, { id: 'cookie', name: 'Atta Cookie', sellingPrice: 20 }];
const order = (over: Record<string, any> = {}): any => ({ id: 'ord12345', menuItemId: 'cake', quantity: 2, date: '2026-03-10', customerName: 'Priya', customerPhone: '+91 98450 10101', ...over });
const baseSettings: any = { name: 'Asha Bakes', address: '14 MG Road', phone: '+91 98450 00199', logo: '', primaryColor: '', email: '' };
const INR = { code: 'INR', symbol: '₹' };

/** The bold Total row at the foot of the bill (the table header also says "Total"). */
const grandTotal = () => screen.getAllByText('Total').find(el => el.tagName === 'SPAN')!.nextElementSibling?.textContent;

const renderBill = (over: { orders?: any[]; settings?: any; currency?: any } = {}) =>
  render(<BillModal orders={over.orders ?? [order()]} menu={menu} settings={{ ...baseSettings, ...over.settings }} currency={over.currency ?? INR} onClose={vi.fn()} />);

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ token: TOKEN }) });
  (URL as any).createObjectURL = vi.fn(() => 'blob:x');
  (URL as any).revokeObjectURL = vi.fn();
  vi.spyOn(window, 'open').mockImplementation(() => null);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {}); // jsdom can't "download"
});
afterEach(() => {
  vi.restoreAllMocks();
  delete (navigator as any).canShare;
  delete (navigator as any).share;
});

describe('BillModal', () => {
  it('shows the itemised bill with business details, delivery and total', () => {
    renderBill({ orders: [order({ deliveryCharge: 50 })] });
    expect(screen.getByRole('dialog', { name: 'Bill' })).toBeTruthy();
    expect(screen.getByText('Asha Bakes')).toBeTruthy();
    expect(screen.getByText('Chocolate Cake')).toBeTruthy();
    expect(screen.getAllByText('₹1,000.00')).toHaveLength(2); // the line (2 x 500) and the items subtotal
    expect(screen.getByText('Delivery').nextElementSibling?.textContent).toBe('₹50.00');
    expect(grandTotal()).toBe('₹1,050.00');
  });

  it('shows a GST breakup that matches the dashboard split', () => {
    renderBill({ settings: { gstApplicable: true, gstRate: 18, gstPricingMode: 'exclusive' } });
    expect(screen.getByText('GST (18%)').nextElementSibling?.textContent).toBe('₹180.00'); // 1000 x 18%
    expect(grandTotal()).toBe('₹1,180.00');
  });

  it('puts every item of a multi-item order on one bill', () => {
    renderBill({ orders: [order({ id: 'a', orderGroupId: 'g' }), order({ id: 'b', orderGroupId: 'g', menuItemId: 'cookie', quantity: 5 })] });
    expect(screen.getByText('Chocolate Cake')).toBeTruthy();
    expect(screen.getByText('Atta Cookie')).toBeTruthy();
    expect(grandTotal()).toBe('₹1,100.00');
  });

  describe('UPI payment QR', () => {
    it('is left out entirely when the business has no UPI ID', async () => {
      renderBill();
      await screen.findByAltText(/view this bill online/i);
      expect(screen.queryByAltText(/UPI payment QR/i)).toBeNull();
      expect(screen.queryByText(/scan to pay/i)).toBeNull();
    });
    it('is shown when a UPI ID is set and the bill is in rupees', async () => {
      renderBill({ settings: { upiId: 'asha@okhdfcbank' } });
      expect(await screen.findByAltText(/UPI payment QR/i)).toBeTruthy();
      expect(screen.getByText('Scan to pay (UPI)')).toBeTruthy();
    });
    it('is not shown for a business billing in another currency', async () => {
      renderBill({ settings: { upiId: 'asha@okhdfcbank' }, currency: { code: 'USD', symbol: '$' } });
      await screen.findByAltText(/view this bill online/i);
      expect(screen.queryByAltText(/UPI payment QR/i)).toBeNull();
    });
    it('tells the owner why it is missing: no UPI ID yet', async () => {
      renderBill();
      await screen.findByAltText(/view this bill online/i);
      expect(screen.getByRole('note').textContent).toMatch(/Add your UPI ID in Settings/);
    });
    it('tells the owner why it is missing: the bill is not in INR', async () => {
      renderBill({ settings: { upiId: 'asha@okhdfcbank' }, currency: { code: 'USD', symbol: '$' } });
      await screen.findByAltText(/view this bill online/i);
      expect(screen.getByRole('note').textContent).toMatch(/only for bills in INR.*in USD/);
    });
    it('shows no explanation when the QR is there', async () => {
      renderBill({ settings: { upiId: 'asha@okhdfcbank' } });
      await screen.findByAltText(/UPI payment QR/i);
      expect(screen.queryByRole('note')).toBeNull();
    });
  });

  describe('view bill online QR', () => {
    it('asks the server for the link once and shows its QR', async () => {
      renderBill();
      expect(await screen.findByAltText(/view this bill online/i)).toBeTruthy();
      expect(apiFetch).toHaveBeenCalledTimes(1);
      expect(apiFetch.mock.calls[0][0]).toBe('/api/bills');
      expect(JSON.parse(apiFetch.mock.calls[0][1].body)).toEqual({ orderId: 'ord12345' });
    });
    it('says so, instead of showing a broken QR, when the link cannot be made', async () => {
      apiFetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'nope' }) });
      renderBill();
      expect(await screen.findByText(/online link unavailable/i)).toBeTruthy();
      expect(screen.queryByAltText(/view this bill online/i)).toBeNull();
      expect((screen.getByRole('button', { name: /Send via WhatsApp/ }) as HTMLButtonElement).disabled).toBe(false);
    });
  });

  describe('Send via WhatsApp', () => {
    it('is disabled with an explanation, not a dead click, when the order has no phone number', async () => {
      renderBill({ orders: [order({ customerPhone: undefined })] });
      await screen.findByAltText(/view this bill online/i);
      const button = screen.getByRole('button', { name: /Send via WhatsApp/ }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(screen.getByText(/Add a customer phone number/i)).toBeTruthy();
      fireEvent.click(button);
      expect(window.open).not.toHaveBeenCalled();
    });
    it('is disabled when the phone number cannot be a real number', async () => {
      renderBill({ orders: [order({ customerPhone: '555-0101' })] });
      await screen.findByAltText(/view this bill online/i);
      expect((screen.getByRole('button', { name: /Send via WhatsApp/ }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText(/doesn't look right/i)).toBeTruthy();
    });
    it('waits for the online link, so the message can include it', () => {
      apiFetch.mockReturnValue(new Promise(() => {}));
      renderBill();
      expect((screen.getByRole('button', { name: /Send via WhatsApp/ }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('on desktop: saves the bill image and opens wa.me with the customer number and message', async () => {
      renderBill();
      await screen.findByAltText(/view this bill online/i);
      fireEvent.click(screen.getByRole('button', { name: /Send via WhatsApp/ }));
      await waitFor(() => expect(window.open).toHaveBeenCalled());
      const url = (window.open as any).mock.calls[0][0] as string;
      expect(url.startsWith('https://wa.me/919845010101?text=')).toBe(true);
      const text = decodeURIComponent(url.split('text=')[1]);
      expect(text).toContain('Hi Priya');
      expect(text).toContain('Asha Bakes');
      expect(text).toContain('₹1,000.00');
      expect(text).toContain(`/bill/${TOKEN}`);
      expect(URL.createObjectURL).toHaveBeenCalled(); // the image was saved to attach
      expect(await screen.findByRole('status')).toBeTruthy();
    });

    it('on phones: hands the bill image to the share sheet and does not open a tab', async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      (navigator as any).canShare = vi.fn(() => true);
      (navigator as any).share = share;
      renderBill();
      await screen.findByAltText(/view this bill online/i);
      fireEvent.click(screen.getByRole('button', { name: /Send via WhatsApp/ }));
      await waitFor(() => expect(share).toHaveBeenCalled());
      const arg = share.mock.calls[0][0];
      expect(arg.files[0].name).toBe('bill-ORD12345.png');
      expect(arg.text).toContain(`/bill/${TOKEN}`);
      expect(window.open).not.toHaveBeenCalled();
    });

    it('does nothing more when the owner closes the share sheet', async () => {
      (navigator as any).canShare = vi.fn(() => true);
      (navigator as any).share = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' }));
      renderBill();
      await screen.findByAltText(/view this bill online/i);
      fireEvent.click(screen.getByRole('button', { name: /Send via WhatsApp/ }));
      await waitFor(() => expect((navigator as any).share).toHaveBeenCalled());
      expect(window.open).not.toHaveBeenCalled();
    });
  });

  it('downloads the bill as an image', async () => {
    renderBill();
    fireEvent.click(screen.getByRole('button', { name: /Download/ }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
  });
});
