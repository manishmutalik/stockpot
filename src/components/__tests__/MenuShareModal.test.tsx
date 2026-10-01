import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const elementsToPdf = vi.fn();
vi.mock('../../utils/pdfExport', () => ({ elementsToPdf: (...a: any[]) => elementsToPdf(...a) }));

import { MenuShareModal } from '../MenuShareModal';

const menu: any[] = [
  { id: 'a', name: 'Chocolate Cake', sellingPrice: 500, category: 'Cakes', description: 'Rich dark chocolate, 6 inch', recipe: [] },
  { id: 'b', name: 'Atta Cookie', sellingPrice: 20, recipe: [] },
  { id: 'c', name: 'Unpriced', sellingPrice: 0, recipe: [] },
];
const settings: any = { name: "Asha's Bakes", address: '14 MG Road', phone: '+91 98450 00199', logo: '', primaryColor: '', email: '' };
const INR = { code: 'INR', symbol: '₹' };

const renderModal = (over: Record<string, any> = {}) =>
  render(<MenuShareModal menu={menu} settings={settings} currency={INR} customerName="Priya" customerPhone="+91 98450 10101" onClose={vi.fn()} {...over} />);

const pdf = () => new File(['%PDF-1.3'], 'asha-s-bakes-menu.pdf', { type: 'application/pdf' });

beforeEach(() => {
  elementsToPdf.mockReset();
  elementsToPdf.mockImplementation(async () => pdf());
  (URL as any).createObjectURL = vi.fn(() => 'blob:x');
  (URL as any).revokeObjectURL = vi.fn();
  vi.spyOn(window, 'open').mockImplementation(() => null);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  delete (navigator as any).canShare;
  delete (navigator as any).share;
});

describe('MenuShareModal', () => {
  it('previews the live menu (priced items only) and names who it is for', () => {
    renderModal();
    expect(screen.getByRole('dialog', { name: 'Share menu' })).toBeTruthy();
    expect(screen.getByText('For Priya')).toBeTruthy();
    // the preview draws the real pages
    expect(screen.getAllByText('Chocolate Cake').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Atta Cookie').length).toBeGreaterThan(0);
    expect(screen.queryByText('Unpriced')).toBeNull();
  });

  it('follows the menu as it changes, since nothing is cached', () => {
    const { rerender } = renderModal();
    rerender(<MenuShareModal menu={[...menu, { id: 'd', name: 'Brand New Brownie', sellingPrice: 90, recipe: [] }]} settings={settings} currency={INR} customerPhone="9845010101" onClose={vi.fn()} />);
    expect(screen.getAllByText('Brand New Brownie').length).toBeGreaterThan(0);
  });

  it('draws every page and names the file after the business when downloading', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Download/ }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    expect(elementsToPdf).toHaveBeenCalledTimes(1);
    expect(elementsToPdf.mock.calls[0][1]).toBe('asha-s-bakes-menu.pdf');
    expect(elementsToPdf.mock.calls[0][0].length).toBeGreaterThan(0);
  });

  it('says so when the PDF could not be made', async () => {
    elementsToPdf.mockResolvedValue(null);
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Download/ }));
    expect((await screen.findByRole('status')).textContent).toMatch(/Couldn't create the menu PDF/);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  describe('Send via WhatsApp', () => {
    it('is disabled with an explanation when the order has no phone number', () => {
      renderModal({ customerPhone: undefined });
      const button = screen.getByRole('button', { name: /Send via WhatsApp/ }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(screen.getByText(/Add a customer phone number/i)).toBeTruthy();
      fireEvent.click(button);
      expect(window.open).not.toHaveBeenCalled();
    });
    it('is disabled when the phone number cannot be real, but Download still works', () => {
      renderModal({ customerPhone: '555-0101' });
      expect((screen.getByRole('button', { name: /Send via WhatsApp/ }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText(/doesn't look right/i)).toBeTruthy();
      expect((screen.getByRole('button', { name: /Download/ }) as HTMLButtonElement).disabled).toBe(false);
    });

    it('on desktop: saves the PDF and opens wa.me with the number and a short message', async () => {
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: /Send via WhatsApp/ }));
      await waitFor(() => expect(window.open).toHaveBeenCalled());
      const url = (window.open as any).mock.calls[0][0] as string;
      expect(url.startsWith('https://wa.me/919845010101?text=')).toBe(true);
      expect(decodeURIComponent(url.split('text=')[1])).toBe("Hi Priya, here's our menu from Asha's Bakes.");
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect((await screen.findByRole('status')).textContent).toMatch(/Attach it in WhatsApp/);
    });

    it('on phones: hands the PDF to the share sheet and does not open a tab', async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      (navigator as any).canShare = vi.fn(() => true);
      (navigator as any).share = share;
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: /Send via WhatsApp/ }));
      await waitFor(() => expect(share).toHaveBeenCalled());
      const arg = share.mock.calls[0][0];
      expect(arg.files[0].name).toBe('asha-s-bakes-menu.pdf');
      expect(arg.files[0].type).toBe('application/pdf');
      expect(arg.text).toBe("Hi Priya, here's our menu from Asha's Bakes.");
      expect(window.open).not.toHaveBeenCalled();
    });

    it('does nothing more when the owner closes the share sheet', async () => {
      (navigator as any).canShare = vi.fn(() => true);
      (navigator as any).share = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' }));
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: /Send via WhatsApp/ }));
      await waitFor(() => expect((navigator as any).share).toHaveBeenCalled());
      expect(window.open).not.toHaveBeenCalled();
    });

    it('still opens WhatsApp with the message when the PDF could not be made', async () => {
      elementsToPdf.mockResolvedValue(null);
      renderModal();
      fireEvent.click(screen.getByRole('button', { name: /Send via WhatsApp/ }));
      await waitFor(() => expect(window.open).toHaveBeenCalled());
      expect((await screen.findByRole('status')).textContent).toMatch(/message only/);
    });
  });

  it('explains an empty menu instead of making a blank PDF', () => {
    renderModal({ menu: [{ id: 'z', name: 'Free', sellingPrice: 0, recipe: [] }] });
    expect(screen.getByText(/no priced items/i)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Download/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Send via WhatsApp/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
