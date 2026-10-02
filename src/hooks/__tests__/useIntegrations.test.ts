import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const setDocMock = vi.fn();
const apiFetch = vi.fn();
vi.mock('../../firebase', () => ({
  auth: { currentUser: { uid: 'user1' } },
  db: {},
  doc: vi.fn((...args: any[]) => ({ path: args.join('/') })),
  setDoc: (...a: any[]) => setDocMock(...a),
}));
vi.mock('../../utils/apiClient', () => ({ apiFetch: (...a: any[]) => apiFetch(...a) }));

import { useIntegrations } from '../useIntegrations';
import type { MenuItem, RawMaterial } from '../../types';

const materials = [{ id: 'flour', unit: 'kg', costPerUnit: 40, category: 'Raw Materials' }] as unknown as RawMaterial[];
const menu = [{ id: 'cake', name: 'Chocolate Cake', sellingPrice: 600, recipe: [{ materialId: 'flour', amount: 500, unit: 'g' }], finishedGoodsStock: 20 }] as unknown as MenuItem[];
const json = (body: any) => Promise.resolve({ json: async () => body });

const orderWrites = () => setDocMock.mock.calls.filter(([ref]: any[]) => ref.path.includes('/orders/')).map(c => c[1]);

beforeEach(() => {
  setDocMock.mockReset();
  apiFetch.mockReset();
});

describe('importing orders stamps them', () => {
  it('Shopify: stamps the price the customer actually paid, and the cost from the recipe', async () => {
    apiFetch.mockImplementation((url: string) => {
      if (url.includes('/shopify/status')) return json({ connected: true, shop: 's.myshopify.com' });
      if (url.includes('/odoo/status')) return json({ connected: false });
      if (url.includes('/shopify/orders')) return json([{ line_items: [{ title: 'chocolate cake', quantity: 2, price: '540.00' }], customer: { first_name: 'Asha', last_name: 'Rao' } }]);
      return json({});
    });
    const { result } = renderHook(() => useIntegrations(menu, materials, '2026-04-01', vi.fn(), true));
    await waitFor(() => expect(result.current.shopifyStatus.connected).toBe(true));
    await act(async () => { await result.current.importShopifyOrders(); });
    const [order] = orderWrites();
    expect(order).toMatchObject({ menuItemId: 'cake', quantity: 2, unitPriceAtSale: 540, unitIngredientCostAtSale: 20, itemNameAtSale: 'Chocolate Cake' });
  });

  it('Shopify: falls back to the menu price when the line carries none', async () => {
    apiFetch.mockImplementation((url: string) => {
      if (url.includes('/shopify/status')) return json({ connected: true });
      if (url.includes('/odoo/status')) return json({ connected: false });
      if (url.includes('/shopify/orders')) return json([{ line_items: [{ title: 'Chocolate Cake', quantity: 1 }] }]);
      return json({});
    });
    const { result } = renderHook(() => useIntegrations(menu, materials, '2026-04-01', vi.fn(), true));
    await waitFor(() => expect(result.current.shopifyStatus.connected).toBe(true));
    await act(async () => { await result.current.importShopifyOrders(); });
    expect(orderWrites()[0].unitPriceAtSale).toBe(600);
  });

  it('Odoo: stamps the unit price Odoo sold it for', async () => {
    apiFetch.mockImplementation((url: string) => {
      if (url.includes('/shopify/status')) return json({ connected: false });
      if (url.includes('/odoo/status')) return json({ connected: true, url: 'https://o.example' });
      if (url.includes('/odoo/orders')) return json([{ id: 7, partner_id: [1, 'Cafe'], line_items: [{ id: 3, product_id: [9, 'Chocolate Cake'], product_uom_qty: 4, price_unit: 575 }] }]);
      return json({});
    });
    const { result } = renderHook(() => useIntegrations(menu, materials, '2026-04-01', vi.fn(), true));
    await waitFor(() => expect(result.current.odooStatus.connected).toBe(true));
    await act(async () => { await result.current.importOdooOrders(); });
    expect(orderWrites()[0]).toMatchObject({ id: 'odoo-7-3', quantity: 4, unitPriceAtSale: 575, unitIngredientCostAtSale: 20 });
  });
});
