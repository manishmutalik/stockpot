import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
import { OrdersView } from '../OrdersView';

// Sunday 4 October 2026, 11:30 in India.
const NOW = new Date('2026-10-04T06:00:00Z');
const TODAY = '2026-10-04';
const TOMORROW = '2026-10-05';
const LATER = '2026-10-09';

const menu: any[] = [
  { id: 'cake', name: 'Cake', sellingPrice: 100, finishedGoodsStock: 5, recipe: [] },
  { id: 'cookie', name: 'Cookie', sellingPrice: 10, finishedGoodsStock: 20, recipe: [] },
];
const o = (id: string, over: Record<string, any> = {}): any => ({
  id, menuItemId: 'cake', quantity: 1, date: TODAY, unitPriceAtSale: 100, unitIngredientCostAtSale: 0, unitPackagingCostAtSale: 0, unitInputGstAtSale: 0, ...over,
});
const pre = (id: string, over: Record<string, any> = {}) => o(id, { preorder: true, stockClaimed: false, bookedOn: '2026-10-01', date: TOMORROW, ...over });
const advance = (amount: number) => ({ amount, method: 'upi', feeRate: 0, date: '2026-10-01' });

function makeProps(orders: any[], over: Record<string, any> = {}) {
  return {
    orders, menu, materials: [],
    currency: { code: 'INR', symbol: '₹' },
    settings: { name: 'Test Bakery', timezone: 'Asia/Kolkata' },
    orderFilterStart: '2026-10-01', orderFilterEnd: '2026-10-31',
    setOrderFilterStart: vi.fn(), setOrderFilterEnd: vi.fn(),
    setIsAddOrderModalOpen: vi.fn(),
    shopifyStatus: { connected: false }, odooStatus: { connected: false },
    importShopifyOrders: vi.fn(), importOdooOrders: vi.fn(),
    fulfillOrder: vi.fn().mockResolvedValue(true), cancelPreorder: vi.fn().mockResolvedValue(true),
    markOrdersPaid: vi.fn(), setOrdersPaymentMethod: vi.fn(),
    updateOrder: vi.fn(), deleteOrder: vi.fn(),
    ...over,
  } as any;
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
afterEach(() => vi.useRealTimers());

describe('the figures', () => {
  it('count only what has happened: not an order due later, and not a cancelled one', () => {
    const props = makeProps([
      o('a', { quantity: 2 }),                                  // today: counts
      pre('p', { date: LATER, quantity: 3, advance: advance(100) }), // later: booked, not counted
      pre('c', { date: TODAY, cancelledOn: TODAY, quantity: 4 }),    // cancelled: never
    ]);
    render(<OrdersView {...props} />);
    expect(screen.getByText('Total Orders').nextElementSibling?.textContent).toBe('1');
    expect(screen.getByText('2 items sold')).toBeTruthy();
    expect(screen.getByText('Revenue Booked').nextElementSibling?.textContent).toBe('₹200.00');
  });

  it('show what is booked for later and the advances held, on their own', () => {
    const props = makeProps([
      o('a'),
      pre('p', { date: LATER, quantity: 3, advance: advance(100) }),
      pre('q', { date: TOMORROW, quantity: 1, advance: advance(40) }),
    ]);
    render(<OrdersView {...props} />);
    const note = screen.getByRole('note', { name: 'Booked ahead' });
    expect(note.textContent).toContain('Booked for later ₹400.00 in 2 orders');
    expect(note.textContent).toContain('Advances held ₹140.00');
  });

  it('show no such line when nothing is booked ahead', () => {
    render(<OrdersView {...makeProps([o('a')])} />);
    expect(screen.queryByRole('note', { name: 'Booked ahead' })).toBeNull();
  });

  it('keep advances held for a pre-order that is due today but not yet handed over', () => {
    render(<OrdersView {...makeProps([pre('p', { date: TODAY, advance: advance(60) })])} />);
    expect(screen.getByRole('note', { name: 'Booked ahead' }).textContent).toContain('Advances held ₹60.00');
  });
});

describe('a pre-order row', () => {
  it('shows it is a pre-order, when it is due, the slot, the notes, and what is paid and left', () => {
    const props = makeProps([pre('p', { quantity: 2, dueSlot: 'morning', notes: 'Happy birthday Asha', advance: advance(50), customerName: 'Priya' })]);
    render(<OrdersView {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /^All Orders/ }));
    expect(screen.getByText('Pre-order')).toBeTruthy();
    const text = document.body.textContent ?? '';
    expect(text).toContain('Due Mon 5 Oct (morning)');
    expect(text).toContain('Advance ₹50.00 · balance ₹150.00');
    expect(text).toContain('“Happy birthday Asha”');
  });

  it('names a time as a time', () => {
    render(<OrdersView {...makeProps([pre('p', { dueSlot: '16:30' })])} />);
    expect(document.body.textContent).toContain('Due Mon 5 Oct (at 16:30)');
  });

  it('shows a multi-item pre-order\'s details once, in its header', () => {
    const props = makeProps([
      pre('a', { orderGroupId: 'g', quantity: 2, dueSlot: 'evening', advance: advance(80) }),
      pre('b', { orderGroupId: 'g', menuItemId: 'cookie', quantity: 5, dueSlot: 'evening', unitPriceAtSale: 10 }),
    ]);
    render(<OrdersView {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /^All Orders/ }));
    expect(screen.getAllByText('Pre-order')).toHaveLength(1);
    expect(document.body.textContent).toContain('Advance ₹80.00 · balance ₹170.00');
  });

  it('does not cap the quantity at the stock on the shelf, because it holds none', () => {
    render(<OrdersView {...makeProps([pre('p', { quantity: 9 })])} />);
    const qty = screen.getByLabelText('Quantity') as HTMLInputElement;
    expect(qty.getAttribute('max')).toBeNull();
    // The shelf holds 5 cakes: the order's own 9 are not added back to it.
    expect(within(screen.getByLabelText('Item')).getByText(/Cake \(5 in stock\)/)).toBeTruthy();
  });

  it('an ordinary order is capped as before, counting what it already holds', () => {
    render(<OrdersView {...makeProps([o('a', { quantity: 2 })])} />);
    expect((screen.getByLabelText('Quantity') as HTMLInputElement).getAttribute('max')).toBe('7');
  });

  it('a handed-over pre-order holds stock again, so it is capped like an ordinary order', () => {
    render(<OrdersView {...makeProps([pre('p', { quantity: 2, stockClaimed: true, fulfilled: true, date: TODAY })])} />);
    expect((screen.getByLabelText('Quantity') as HTMLInputElement).getAttribute('max')).toBe('7');
  });
});

describe('the Upcoming tab', () => {
  const orders = [
    o('today'),
    pre('soon', { date: TOMORROW, customerName: 'Priya' }),
    pre('far', { date: LATER, customerName: 'Rahul' }),
    pre('done', { date: TOMORROW, customerName: 'Done', stockClaimed: true, fulfilled: true }),
    pre('gone', { date: TOMORROW, customerName: 'Gone', cancelledOn: TODAY }),
    pre('yesterday', { date: '2026-10-03', customerName: 'Overdue' }),
    pre('nextmonth', { date: '2026-11-20', customerName: 'Nov' }),
  ];

  it('counts the pre-orders due after today (handed over early included), whatever date range is shown', () => {
    render(<OrdersView {...makeProps(orders)} />);
    expect(screen.getByRole('button', { name: /^Upcoming/ }).textContent).toContain('4');
  });

  it('lists them soonest first, grouped by due date, with Tomorrow named, and no cancelled or past ones', () => {
    render(<OrdersView {...makeProps(orders)} />);
    fireEvent.click(screen.getByRole('button', { name: /^Upcoming/ }));
    expect(screen.getByDisplayValue('Priya')).toBeTruthy();
    expect(screen.getByDisplayValue('Rahul')).toBeTruthy();
    expect(screen.getByDisplayValue('Nov')).toBeTruthy(); // outside the date range, still upcoming
    expect(screen.getByDisplayValue('Done')).toBeTruthy(); // handed over early: still booked for a later day, so it stays visible
    for (const name of ['Gone', 'Overdue']) expect(screen.queryByDisplayValue(name)).toBeNull();
    const text = document.body.textContent ?? '';
    expect(text).toContain('Tomorrow · Mon, 5 October 2026');
    expect(text.indexOf('5 October')).toBeLessThan(text.indexOf('9 October'));
    expect(text.indexOf('9 October')).toBeLessThan(text.indexOf('20 November'));
  });

  it('says so when there are none', () => {
    render(<OrdersView {...makeProps([o('a')])} />);
    fireEvent.click(screen.getByRole('button', { name: /^Upcoming/ }));
    expect(screen.getByText('No upcoming pre-orders')).toBeTruthy();
  });

  it('can be searched', () => {
    render(<OrdersView {...makeProps(orders)} />);
    fireEvent.click(screen.getByRole('button', { name: /^Upcoming/ }));
    fireEvent.change(screen.getByLabelText('Search orders'), { target: { value: 'rahul' } });
    expect(screen.getByDisplayValue('Rahul')).toBeTruthy();
    expect(screen.queryByDisplayValue('Priya')).toBeNull();
  });
});

describe('cancelled orders', () => {
  const orders = [o('a', { customerName: 'Alive' }), pre('c', { date: TODAY, customerName: 'Cancelled', cancelledOn: TODAY })];

  it('stay visible under All, marked cancelled, and are left out of Pending and Fulfilled', () => {
    render(<OrdersView {...makeProps(orders)} />);
    fireEvent.click(screen.getByRole('button', { name: /^All Orders/ }));
    expect(screen.getByDisplayValue('Cancelled')).toBeTruthy();
    expect(screen.getByText('Cancelled', { selector: 'span' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Pending/ }));
    expect(screen.queryByDisplayValue('Cancelled')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Fulfilled/ }));
    expect(screen.queryByDisplayValue('Cancelled')).toBeNull();
  });

  it('have their own tab, with a count', () => {
    render(<OrdersView {...makeProps(orders)} />);
    expect(screen.getByRole('button', { name: /^Cancelled/ }).textContent).toContain('1');
    fireEvent.click(screen.getByRole('button', { name: /^Cancelled/ }));
    expect(screen.getByDisplayValue('Cancelled')).toBeTruthy();
    expect(screen.queryByDisplayValue('Alive')).toBeNull();
    expect(document.body.textContent).toContain('1 cancelled');
  });

  it('cannot be handed over or cancelled again', () => {
    render(<OrdersView {...makeProps([pre('c', { date: TODAY, cancelledOn: TODAY })])} />);
    fireEvent.click(screen.getByRole('button', { name: /^All Orders/ }));
    expect(screen.queryByRole('button', { name: 'Hand over' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel pre-order' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete Order' })).toBeTruthy();
  });
});

describe('handing a pre-order over', () => {
  it('hands over once, and opens the balance to collect when something is still owed', async () => {
    const p = pre('p', { date: TODAY, quantity: 2, paymentStatus: 'unpaid', advance: advance(50), customerName: 'Priya' });
    const props = makeProps([p]);
    render(<OrdersView {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hand over' }));
    expect(props.fulfillOrder).toHaveBeenCalledTimes(1);
    expect(props.fulfillOrder).toHaveBeenCalledWith(p);
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Collect the balance');
    expect(dialog.textContent).toContain('₹150.00'); // 200 less the 50 already paid
    fireEvent.change(within(dialog).getByLabelText(/Paid by/), { target: { value: 'cash' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark as paid' }));
    expect(props.markOrdersPaid).toHaveBeenCalledWith(['p'], true, 'cash');
  });

  it('does not ask for payment when nothing is owed', async () => {
    const props = makeProps([pre('p', { date: TODAY })]);
    render(<OrdersView {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hand over' }));
    await waitFor(() => expect(props.fulfillOrder).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not ask for payment when the hand-over did not happen (stock was short)', async () => {
    const props = makeProps([pre('p', { date: TODAY, paymentStatus: 'unpaid' })], { fulfillOrder: vi.fn().mockResolvedValue(false) });
    render(<OrdersView {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hand over' }));
    await waitFor(() => expect(props.fulfillOrder).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('hands a multi-item pre-order over once for the whole order, not once per item', async () => {
    const a = pre('a', { orderGroupId: 'g', date: TODAY });
    const b = pre('b', { orderGroupId: 'g', date: TODAY, menuItemId: 'cookie', quantity: 4 });
    const props = makeProps([a, b]);
    render(<OrdersView {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Hand Over/ }));
    expect(props.fulfillOrder).toHaveBeenCalledTimes(1);
    await act(async () => {});
  });

  it('still fulfils an ordinary multi-item order item by item, as before', () => {
    const a = o('a', { orderGroupId: 'g' });
    const b = o('b', { orderGroupId: 'g', menuItemId: 'cookie' });
    const props = makeProps([a, b]);
    render(<OrdersView {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Fulfill All/ }));
    expect(props.fulfillOrder).toHaveBeenCalledTimes(2);
  });

  it('fulfils an ordinary order with no payment step', async () => {
    const props = makeProps([o('a', { paymentStatus: 'unpaid' })]);
    render(<OrdersView {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark Fulfilled' }));
    await act(async () => {});
    expect(props.fulfillOrder).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('cancelling a pre-order', () => {
  it('asks, and cancels it with no advance to settle', async () => {
    const p = pre('p', { quantity: 2, customerName: 'Priya' });
    const props = makeProps([p]);
    render(<OrdersView {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel pre-order' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('2 Cake for Priya');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel pre-order' }));
    expect(props.cancelPreorder).toHaveBeenCalledWith(p, undefined);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks whether an advance is refunded or kept, and says which', () => {
    const p = pre('p', { advance: advance(75) });
    const props = makeProps([p]);
    render(<OrdersView {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel pre-order' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('₹75.00');
    fireEvent.click(within(dialog).getByRole('button', { name: /Keep the ₹75.00 advance/ }));
    expect(props.cancelPreorder).toHaveBeenCalledWith(p, 'kept');
  });

  it('can refund the advance instead', () => {
    const p = pre('p', { advance: advance(75) });
    const props = makeProps([p]);
    render(<OrdersView {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel pre-order' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Refund the ₹75.00 advance/ }));
    expect(props.cancelPreorder).toHaveBeenCalledWith(p, 'refunded');
  });

  it('does nothing when the owner backs out', () => {
    const props = makeProps([pre('p', { advance: advance(75) })]);
    render(<OrdersView {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel pre-order' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: "Don't cancel" }));
    expect(props.cancelPreorder).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cancels a whole multi-item pre-order from its header', async () => {
    const a = pre('a', { orderGroupId: 'g', quantity: 2, advance: advance(30) });
    const b = pre('b', { orderGroupId: 'g', menuItemId: 'cookie', quantity: 4 });
    const props = makeProps([a, b]);
    render(<OrdersView {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('2 Cake, 4 Cookie');
    fireEvent.click(within(dialog).getByRole('button', { name: /Keep the ₹30.00 advance/ }));
    expect(props.cancelPreorder).toHaveBeenCalledTimes(1);
    expect(props.cancelPreorder).toHaveBeenCalledWith(a, 'kept');
  });

  it('is offered only for a pre-order that is still open', () => {
    const props = makeProps([o('a'), pre('done', { stockClaimed: true, fulfilled: true, date: TODAY })]);
    render(<OrdersView {...props} />);
    expect(screen.queryByRole('button', { name: 'Cancel pre-order' })).toBeNull();
  });
});

describe('pending payments', () => {
  it('do not list a pre-order due later, but list one that is due and unpaid', () => {
    const later = pre('later', { paymentStatus: 'unpaid', customerName: 'Later Lata', customerPhone: '9845011111' });
    const due = pre('due', { date: TODAY, paymentStatus: 'unpaid', customerName: 'Due Dev', customerPhone: '9845022222', advance: advance(40) });
    render(<OrdersView {...makeProps([later, due])} />);
    expect(screen.queryByText('Later Lata')).toBeNull();
    expect(screen.getByText('Due Dev')).toBeTruthy();
  });
});
