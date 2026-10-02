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

  describe('pending payments and the consolidated bill', () => {
    const unpaidOrders = [
      o('p1', { customerName: 'Priya', customerPhone: '9845010101', paymentStatus: 'unpaid', date: '2026-03-05' }),
      o('p2', { customerName: 'Priya', customerPhone: '+91 98450 10101', paymentStatus: 'unpaid', menuItemId: 'cookie', quantity: 4, date: '2026-03-08' }),
      o('p3', { customerName: 'Rohan', paymentStatus: 'unpaid', date: '2026-03-09' }),
      o('paid1', { customerName: 'Meera', date: '2026-03-09' }),
    ];
    const withUnpaid = (over: Record<string, any> = {}) => makeProps({ orders: unpaidOrders, markOrdersPaid: vi.fn(), ...over });

    it('lists each customer with what they owe, leaving out paid orders', () => {
      render(<OrdersView {...withUnpaid()} />);
      const panel = screen.getByRole('region', { name: 'Pending payments' });
      expect(within(panel).getByText('Priya')).toBeTruthy();
      expect(within(panel).getByText('Rohan')).toBeTruthy();
      expect(within(panel).queryByText('Meera')).toBeNull();
      expect(within(panel).getByText('$140.00')).toBeTruthy(); // 100 + 4 x 10
      expect(within(panel).getByText(/2 customers · 3 orders/)).toBeTruthy();
    });

    it('is not shown at all when nothing is pending', () => {
      render(<OrdersView {...makeProps()} />);
      expect(screen.queryByRole('region', { name: 'Pending payments' })).toBeNull();
    });

    it('includes pending orders from outside the date range', () => {
      const old = o('old1', { customerName: 'Old Customer', paymentStatus: 'unpaid', date: '2026-01-02' });
      render(<OrdersView {...makeProps({ orders: [...orders, old], markOrdersPaid: vi.fn() })} />);
      expect(within(screen.getByRole('region', { name: 'Pending payments' })).getByText('Old Customer')).toBeTruthy();
    });

    it("opens one consolidated bill with all of the customer's pending orders", async () => {
      render(<OrdersView {...withUnpaid()} />);
      fireEvent.click(screen.getByRole('button', { name: 'Send consolidated bill to Priya' }));
      const dialog = await screen.findByRole('dialog', { name: 'Consolidated bill' });
      expect(within(dialog).getByText('Cake')).toBeTruthy();
      expect(within(dialog).getByText('Cookie')).toBeTruthy();
      expect(within(dialog).queryByText(/Total due/)).toBeTruthy();
      expect(within(dialog).getAllByText('$140.00').length).toBeGreaterThan(0);
    });

    it("asks how it was paid, then marks all of a customer's orders paid", () => {
      const props = withUnpaid();
      render(<OrdersView {...props} />);
      fireEvent.click(screen.getByRole('button', { name: 'Mark everything paid for Priya' }));
      expect(props.markOrdersPaid).not.toHaveBeenCalled();
      const dialog = screen.getByRole('dialog');
      fireEvent.change(within(dialog).getByLabelText(/Paid by/), { target: { value: 'upi' } });
      fireEvent.click(within(dialog).getByRole('button', { name: /Mark as paid/ }));
      expect(props.markOrdersPaid).toHaveBeenCalledWith(['p1', 'p2'], true, 'upi');
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('marks paid without a method when none is chosen', () => {
      const props = withUnpaid();
      render(<OrdersView {...props} />);
      fireEvent.click(screen.getByRole('button', { name: 'Mark everything paid for Priya' }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Mark as paid/ }));
      expect(props.markOrdersPaid).toHaveBeenCalledWith(['p1', 'p2'], true, undefined);
    });

    it('does nothing when the mark-paid dialog is cancelled', () => {
      const props = withUnpaid();
      render(<OrdersView {...props} />);
      fireEvent.click(screen.getByRole('button', { name: 'Mark everything paid for Priya' }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
      expect(props.markOrdersPaid).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('tags an unpaid order, and marking it paid asks for the method', () => {
      const props = withUnpaid({ orders: [o('solo', { customerName: 'Solo', paymentStatus: 'unpaid' })] });
      render(<OrdersView {...props} />);
      fireEvent.click(screen.getByRole('button', { name: 'Unpaid, mark as paid' }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Mark as paid/ }));
      expect(props.markOrdersPaid).toHaveBeenCalledWith(['solo'], true, undefined);
    });

    it('tags a multi-item order once, in its header, and marks every item paid together', () => {
      const props = withUnpaid({ orders: [
        o('g1', { orderGroupId: 'g', customerName: 'Aris', paymentStatus: 'unpaid' }),
        o('g2', { orderGroupId: 'g', customerName: 'Aris', paymentStatus: 'unpaid', menuItemId: 'cookie' }),
      ] });
      render(<OrdersView {...props} />);
      const tags = screen.getAllByRole('button', { name: /^Unpaid, mark/ });
      expect(tags).toHaveLength(1);
      fireEvent.click(tags[0]);
      const dialog = screen.getByRole('dialog');
      fireEvent.change(within(dialog).getByLabelText(/Paid by/), { target: { value: 'cash' } });
      fireEvent.click(within(dialog).getByRole('button', { name: /Mark as paid/ }));
      expect(props.markOrdersPaid).toHaveBeenCalledWith(['g1', 'g2'], true, 'cash');
    });

    it('lets an order be marked unpaid from its details', () => {
      const props = withUnpaid({ orders: [o('solo', { customerName: 'Solo' })] });
      render(<OrdersView {...props} />);
      fireEvent.click(screen.getByRole('button', { name: 'Delivery details' }));
      fireEvent.change(screen.getByLabelText('Payment'), { target: { value: 'unpaid' } });
      expect(props.markOrdersPaid).toHaveBeenCalledWith(['solo'], false);
    });
  });

  describe('Share Menu', () => {
    it("opens the menu for a single order's customer, with their name", async () => {
      render(<OrdersView {...makeProps()} />);
      const row = screen.getByDisplayValue('Misha').closest('div.p-3') as HTMLElement;
      fireEvent.click(within(row).getByRole('button', { name: 'Share menu' }));
      const dialog = await screen.findByRole('dialog', { name: 'Share menu' });
      expect(within(dialog).getByText('For Misha')).toBeTruthy();
    });

    it('offers one Share Menu per multi-item order, from its header, using the first customer details it has', async () => {
      render(<OrdersView {...makeProps()} />);
      fireEvent.click(screen.getByTitle('Share the menu with this customer'));
      const dialog = await screen.findByRole('dialog', { name: 'Share menu' });
      expect(within(dialog).getByText('For Aris')).toBeTruthy();
      // one icon button per standalone order (a, b); the two group items have none
      expect(screen.getAllByRole('button', { name: 'Share menu' })).toHaveLength(2);
    });

    it('sits next to the bill button, so both are found together', () => {
      render(<OrdersView {...makeProps()} />);
      const bill = screen.getAllByRole('button', { name: 'Generate Bill' })[0];
      expect(bill.nextElementSibling?.getAttribute('aria-label')).toBe('Share menu');
    });
  });

  it("values orders at the price they were made at, not today's menu price", () => {
    const stampedOrders = [o('s1', { customerName: 'Stamped', quantity: 2, unitPriceAtSale: 60 })]; // menu now says Cake = 100
    render(<OrdersView {...makeProps({ orders: stampedOrders })} />);
    expect(screen.getAllByText('$120.00').length).toBeGreaterThan(1); // the row total (2 x 60) and the day header
    expect(screen.queryByText('$200.00')).toBeNull(); // not 2 x today's 100
    expect(screen.getByText('Revenue Booked').nextElementSibling?.textContent).toBe('$120.00');
  });

  describe('what an order made', () => {
    // 1 cake sold at 100 that cost 30 to make and package.
    const stamp = { unitPriceAtSale: 100, unitIngredientCostAtSale: 20, unitPackagingCostAtSale: 10, unitInputGstAtSale: 0, itemNameAtSale: 'Cake' };
    const made = (id: string, over: Record<string, any> = {}) => o(id, { customerName: 'Nisha', ...stamp, ...over });
    const render1 = (list: any[], over: Record<string, any> = {}) =>
      render(<OrdersView {...makeProps({ orders: list, materials: [], setOrdersPaymentMethod: vi.fn(), markOrdersPaid: vi.fn(), ...over })} />);

    it('shows Made on a single order, and opens the breakdown on a click', () => {
      render1([made('m1')]);
      const badge = screen.getByRole('button', { name: 'Made $70.00. Show breakdown' });
      expect(screen.queryByRole('group', { name: 'How this was worked out' })).toBeNull();
      fireEvent.click(badge);
      const g = within(screen.getByRole('group', { name: 'How this was worked out' }));
      expect(g.getByText('Items')).toBeTruthy();
      expect(g.getByText('Ingredients')).toBeTruthy();
      expect(g.getByText('Packaging')).toBeTruthy();
      expect(g.getByText('Made on this order')).toBeTruthy();
      fireEvent.click(badge);
      expect(screen.queryByRole('group', { name: 'How this was worked out' })).toBeNull();
    });

    it('shows Lost when the order cost more than it brought in', () => {
      render1([made('m1', { unitPriceAtSale: 10 })]);
      expect(screen.getByRole('button', { name: 'Lost $20.00. Show breakdown' })).toBeTruthy();
    });

    it('takes a discount off what was made, and the breakdown shows it', () => {
      render1([made('m1', { discount: 15 })]);
      fireEvent.click(screen.getByRole('button', { name: 'Made $55.00. Show breakdown' }));
      expect(within(screen.getByRole('group', { name: 'How this was worked out' })).getByText('Discount')).toBeTruthy();
    });

    it('takes the payment fee off, using the rate the order was stamped with', () => {
      render1([made('m1', { paymentMethod: 'card', paymentFeeRate: 3 })]);
      expect(screen.getByRole('button', { name: 'Made $67.00. Show breakdown' })).toBeTruthy();
    });

    it('shows one Made figure for a multi-item order, with the shared discount counted once', () => {
      render1([
        made('g1', { orderGroupId: 'g', discount: 20 }),
        made('g2', { orderGroupId: 'g', menuItemId: 'cookie', unitPriceAtSale: 10, unitIngredientCostAtSale: 2, unitPackagingCostAtSale: 0 }),
      ]);
      // 100 + 10 - 20 discount - 30 - 2 costs
      expect(screen.getAllByRole('button', { name: /^Made / })).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Made $58.00. Show breakdown' })).toBeTruthy();
    });

    it('marks an order from before prices were recorded as estimated', () => {
      render1([o('old1', { customerName: 'Nisha' })]);
      expect(screen.getByRole('button', { name: /\(estimated\)/ })).toBeTruthy();
    });

    it('records how a paid order was paid, from its details', () => {
      const props = makeProps({ orders: [made('m1')], materials: [], setOrdersPaymentMethod: vi.fn() });
      render(<OrdersView {...props} />);
      fireEvent.click(screen.getByRole('button', { name: 'Delivery details' }));
      fireEvent.change(screen.getByLabelText('Paid by'), { target: { value: 'upi' } });
      expect(props.setOrdersPaymentMethod).toHaveBeenCalledWith(['m1'], 'upi');
    });

    it('does not ask how an unpaid order was paid', () => {
      render1([made('m1', { paymentStatus: 'unpaid' })]);
      fireEvent.click(screen.getByRole('button', { name: 'Delivery details' }));
      expect(screen.queryByLabelText('Paid by')).toBeNull();
    });

    it('edits the discount once for the whole of a multi-item order', () => {
      const props = makeProps({
        orders: [made('g1', { orderGroupId: 'g' }), made('g2', { orderGroupId: 'g', menuItemId: 'cookie' })],
        materials: [], setOrdersPaymentMethod: vi.fn(),
      });
      render(<OrdersView {...props} />);
      for (const b of screen.getAllByRole('button', { name: 'Delivery details' })) fireEvent.click(b);
      const fields = screen.getAllByLabelText('Discount on the whole order');
      expect(fields).toHaveLength(1);
      fireEvent.change(fields[0], { target: { value: '12' } });
      expect(props.updateOrder).toHaveBeenCalledWith('g1', 'discount', 12);
    });
  });
});
