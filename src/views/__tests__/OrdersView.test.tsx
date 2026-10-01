import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { OrdersView } from '../OrdersView';

const menu: any[] = [
  { id: 'cake', name: 'Cake', sellingPrice: 100, finishedGoodsStock: 5, recipe: [] },
  { id: 'cookie', name: 'Cookie', sellingPrice: 10, finishedGoodsStock: 20, recipe: [] },
];
const o = (id: string, over: Record<string, any> = {}): any => ({ id, menuItemId: 'cake', quantity: 1, date: '2026-03-10', ...over });

const orders = [
  o('a', { customerName: 'Misha', customerPhone: '98201', deliveryMethod: 'third_party', deliveryCharge: 100, deliveryFee: 123, deliveryAddress: 'Vascon' }),
  o('b', { customerName: 'Rajani', fulfilled: true, quantity: 2 }),
  o('c', { orderGroupId: 'g', customerName: 'Aris', menuItemId: 'cake' }),
  o('d', { orderGroupId: 'g', customerName: 'Aris', menuItemId: 'cookie', quantity: 3, fulfilled: true }),
  o('old', { date: '2026-01-01', customerName: 'Outside' }),
];

function makeProps(over: Record<string, any> = {}) {
  return {
    orders, menu,
    currency: { code: 'USD', symbol: '$' },
    settings: { name: 'Test Bakery' },
    orderFilterStart: '2026-03-01', orderFilterEnd: '2026-03-31',
    setOrderFilterStart: vi.fn(), setOrderFilterEnd: vi.fn(),
    setIsAddOrderModalOpen: vi.fn(),
    shopifyStatus: { connected: false }, odooStatus: { connected: false },
    importShopifyOrders: vi.fn(), importOdooOrders: vi.fn(),
    fulfillOrder: vi.fn(), updateOrder: vi.fn(), deleteOrder: vi.fn(),
    ...over,
  } as any;
}

describe('OrdersView', () => {
  it('summarises the range, counting a multi-item order once', () => {
    render(<OrdersView {...makeProps()} />);
    // 3 orders in range: a, b, and group g (c+d). The January order is outside.
    expect(screen.getByText('Total Orders').nextElementSibling?.textContent).toBe('3');
    expect(screen.getByText('7 items sold')).toBeTruthy(); // 1 + 2 + 1 + 3
    expect(screen.getByText('$123.00')).toBeTruthy(); // courier cost
    expect(screen.getByText('-$23.00 net')).toBeTruthy(); // charged 100, paid 123
    expect(screen.getByText('Pending Fulfilment').nextElementSibling?.textContent).toBe('2'); // a + group g
  });

  it('filters by status and reports counts on the tabs', () => {
    render(<OrdersView {...makeProps()} />);
    expect(screen.getByRole('button', { name: /All Orders/ }).textContent).toContain('3');
    fireEvent.click(screen.getByRole('button', { name: /^Fulfilled/ }));
    expect(screen.queryByDisplayValue('Misha')).toBeNull();
    expect(screen.getByDisplayValue('Rajani')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Pending/ }));
    expect(screen.getByDisplayValue('Misha')).toBeTruthy();
    expect(screen.queryByDisplayValue('Rajani')).toBeNull();
  });

  it('keeps a multi-item order whole when one of its items matches', () => {
    render(<OrdersView {...makeProps()} />);
    fireEvent.change(screen.getByLabelText('Search orders'), { target: { value: 'cookie' } });
    // Only the group has a cookie, but both its rows (cake + cookie) stay visible.
    expect(screen.getAllByDisplayValue('Aris')).toHaveLength(2);
    expect(screen.queryByDisplayValue('Misha')).toBeNull();
    expect(screen.getByText(/Order \(2 items\)/)).toBeTruthy();
  });

  it('searches by phone and address and says so when nothing matches', () => {
    render(<OrdersView {...makeProps()} />);
    fireEvent.change(screen.getByLabelText('Search orders'), { target: { value: '98201' } });
    expect(screen.getByDisplayValue('Misha')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search orders'), { target: { value: 'vascon' } });
    expect(screen.getByDisplayValue('Misha')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search orders'), { target: { value: 'zzz' } });
    expect(screen.getByText('No orders match these filters')).toBeTruthy();
  });

  it('shows the empty state with a Log First Sale button when the range has no orders', () => {
    const props = makeProps({ orderFilterStart: '2025-01-01', orderFilterEnd: '2025-01-31' });
    render(<OrdersView {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Log First Sale/ }));
    expect(props.setIsAddOrderModalOpen).toHaveBeenCalledWith(true);
  });

  it('keeps row editing and actions wired to the same handlers', () => {
    const props = makeProps();
    render(<OrdersView {...props} />);
    const row = screen.getByDisplayValue('Misha').closest('div.p-3')!;
    fireEvent.change(within(row as HTMLElement).getByLabelText('Customer name'), { target: { value: 'Misha S' } });
    expect(props.updateOrder).toHaveBeenCalledWith('a', 'customerName', 'Misha S');
    fireEvent.click(within(row as HTMLElement).getByLabelText('Mark Fulfilled'));
    expect(props.fulfillOrder).toHaveBeenCalledWith(orders[0]);
    fireEvent.click(within(row as HTMLElement).getByLabelText('Delete Order'));
    expect(props.deleteOrder).toHaveBeenCalledWith('a');
  });

  it('shows the delivery margin once a courier order is expanded', () => {
    render(<OrdersView {...makeProps()} />);
    const row = screen.getByDisplayValue('Misha').closest('div.p-3') as HTMLElement;
    fireEvent.click(within(row).getByLabelText('Delivery details'));
    expect(within(row).getByText('Delivery margin')).toBeTruthy();
    expect(within(row).getByText('-$23.00')).toBeTruthy();
  });

  it('fulfils every open item of a multi-item order at once', () => {
    const props = makeProps();
    render(<OrdersView {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Fulfill All/ }));
    expect(props.fulfillOrder).toHaveBeenCalledTimes(1); // only 'c' is still open
    expect(props.fulfillOrder).toHaveBeenCalledWith(orders[2]);
  });

  it('applies the quick range shortcuts', () => {
    const props = makeProps();
    render(<OrdersView {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '7 Days' }));
    expect(props.setOrderFilterStart).toHaveBeenCalled();
    expect(props.setOrderFilterEnd).toHaveBeenCalled();
  });

  it('only offers marketplace imports when connected', () => {
    const { rerender } = render(<OrdersView {...makeProps()} />);
    expect(screen.queryByText('Shopify Import')).toBeNull();
    rerender(<OrdersView {...makeProps({ shopifyStatus: { connected: true } })} />);
    expect(screen.getByText('Shopify Import')).toBeTruthy();
  });

  describe('Generate Bill', () => {
    it('opens a bill for a single order', async () => {
      render(<OrdersView {...makeProps()} />);
      const row = screen.getByDisplayValue('Rajani').closest('div.p-3') as HTMLElement;
      fireEvent.click(within(row).getByRole('button', { name: 'Generate Bill' }));
      expect(await screen.findByRole('dialog', { name: 'Bill' })).toBeTruthy();
    });

    it('offers one bill per multi-item order, from its header, not one per item', () => {
      render(<OrdersView {...makeProps()} />);
      // a, b and the group header: three bill buttons for three orders (the group's two items have none).
      expect(screen.getAllByRole('button', { name: /Generate (one )?Bill|Generate Bill/i })).toHaveLength(3);
      fireEvent.click(screen.getByTitle('Generate one bill for every item in this order'));
      const dialog = screen.getByRole('dialog', { name: 'Bill' });
      expect(within(dialog).getByText('Cake')).toBeTruthy();
      expect(within(dialog).getByText('Cookie')).toBeTruthy();
    });
  });
});
