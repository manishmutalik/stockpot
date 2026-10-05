import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DueTomorrowCard } from '../DueTomorrowCard';
import { summarizeDue } from '../../utils/preorders';

const TODAY = '2026-10-04';
const menu: any[] = [{ id: 'bread', name: 'Sourdough' }, { id: 'cake', name: 'Chocolate Truffle Cake' }];
let n = 0;
const pre = (over: Record<string, any> = {}): any => ({ id: `p${++n}`, menuItemId: 'bread', quantity: 1, date: '2026-10-05', preorder: true, stockClaimed: false, ...over });

const show = (orders: any[], onOpen = vi.fn()) => { render(<DueTomorrowCard orders={orders} menu={menu} today={TODAY} onOpen={onOpen} />); return onOpen; };

describe('summarizeDue', () => {
  it('adds up the units of each item, most first, and counts a multi-item order once', () => {
    const d = summarizeDue([
      pre({ quantity: 4 }), pre({ quantity: 2, orderGroupId: 'g' }), pre({ menuItemId: 'cake', quantity: 1, orderGroupId: 'g' }), pre({ menuItemId: 'cake', quantity: 5 }),
    ], menu, date => date === '2026-10-05');
    expect(d).toEqual({
      orderCount: 3,
      items: [{ menuItemId: 'cake', name: 'Chocolate Truffle Cake', quantity: 6 }, { menuItemId: 'bread', name: 'Sourdough', quantity: 6 }],
    });
  });

  it('leaves out orders handed over, cancelled, not pre-orders, or not due on those dates', () => {
    const orders = [pre({ fulfilled: true }), pre({ cancelledOn: TODAY }), { ...pre(), preorder: undefined }, pre({ date: '2026-10-09' })];
    expect(summarizeDue(orders, menu, date => date === '2026-10-05')).toBeNull();
  });

  it('names an item by what it was ordered as when it is off the menu now', () => {
    const d = summarizeDue([pre({ menuItemId: 'gone', itemNameAtSale: 'Old Loaf', quantity: 2 })], menu, () => true);
    expect(d?.items[0].name).toBe('Old Loaf');
  });
});

describe('DueTomorrowCard', () => {
  it('shows what is due tomorrow as items and quantities', () => {
    show([pre({ quantity: 6 }), pre({ menuItemId: 'cake', quantity: 1 })]);
    const card = screen.getByRole('region', { name: 'Pre-orders due' });
    expect(card.textContent).toContain('Due tomorrow');
    expect(card.textContent).toContain('Sourdough × 6, Chocolate Truffle Cake × 1');
    expect(card.textContent).toContain('2 orders');
    expect(card.textContent).not.toContain('Due today');
  });

  it('puts today\'s unfinished pre-orders first, overdue ones with them', () => {
    show([pre({ date: TODAY, quantity: 2 }), pre({ date: '2026-10-02', menuItemId: 'cake', quantity: 3 }), pre({ date: '2026-10-05', quantity: 6 })]);
    const text = screen.getByRole('region').textContent ?? '';
    expect(text.indexOf('Due today')).toBeLessThan(text.indexOf('Due tomorrow'));
    expect(text).toContain('Chocolate Truffle Cake × 3, Sourdough × 2');
    expect(text).toContain('Sourdough × 6');
  });

  it('says "1 order" in the singular', () => {
    show([pre()]);
    expect(screen.getByText('1 order')).toBeTruthy();
  });

  it('shows nothing when nothing is due today or tomorrow', () => {
    show([pre({ date: '2026-10-09' }), pre({ fulfilled: true }), pre({ cancelledOn: TODAY })]);
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('opens the Orders tab', () => {
    const onOpen = show([pre()]);
    fireEvent.click(screen.getByRole('button', { name: 'View in Orders' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
