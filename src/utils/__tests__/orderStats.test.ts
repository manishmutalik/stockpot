import { describe, it, expect } from 'vitest';
import { summarizeOrders, orderLineTotal } from '../orderStats';

const menu: any[] = [
  { id: 'cake', name: 'Cake', sellingPrice: 100 },
  { id: 'cookie', name: 'Cookie', sellingPrice: 10 },
];
const o = (id: string, over: Record<string, any> = {}): any => ({ id, menuItemId: 'cake', quantity: 1, date: '2026-03-10', ...over });

describe('orderLineTotal', () => {
  it('multiplies price by quantity and tolerates unknown items', () => {
    expect(orderLineTotal(o('a', { quantity: 3 }), menu)).toBe(300);
    expect(orderLineTotal(o('b', { menuItemId: 'gone' }), menu)).toBe(0);
  });
});

describe('summarizeOrders', () => {
  it('counts a multi-item order once and its delivery once', () => {
    const orders = [
      o('a', { orderGroupId: 'g', quantity: 1, deliveryMethod: 'third_party', deliveryCharge: 40, deliveryFee: 55 }),
      o('b', { orderGroupId: 'g', menuItemId: 'cookie', quantity: 5, deliveryMethod: 'third_party', deliveryCharge: 40, deliveryFee: 55 }),
      o('c', { quantity: 2, fulfilled: true }),
    ];
    const s = summarizeOrders(orders, menu);
    expect(s.orderCount).toBe(2);
    expect(s.itemsSold).toBe(8);
    expect(s.deliveryCharged).toBe(40);
    expect(s.courierCost).toBe(55);
    expect(s.courierDeliveries).toBe(1);
    expect(s.revenue).toBe(100 + 50 + 200 + 40);
  });

  it('tracks what is still to hand over', () => {
    const orders = [
      o('a', { orderGroupId: 'g', quantity: 2, fulfilled: true }),
      o('b', { orderGroupId: 'g', quantity: 3 }), // group still has one open item
      o('c', { quantity: 4, fulfilled: true }),
    ];
    const s = summarizeOrders(orders, menu);
    expect(s.pendingOrders).toBe(1);
    expect(s.pendingItems).toBe(3);
  });

  it('is all zeros for no orders', () => {
    expect(summarizeOrders([], menu)).toEqual({
      orderCount: 0, itemsSold: 0, revenue: 0, discounts: 0, deliveryCharged: 0, courierCost: 0,
      courierDeliveries: 0, pendingOrders: 0, pendingItems: 0,
    });
  });
});
