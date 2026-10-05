import { describe, it, expect } from 'vitest';
import { redactPhones, replaceCustomerNames } from '../aiPrivacy';
import {
  buildOrderForm, numberAppears, ORDER_MAX_ITEMS, ORDER_SCHEMA, ORDER_TEXT_MAX_CHARS, prepareOrderText, quantityAppears, resolveWhen,
  suggestMenuItem, validateParsedOrder,
} from '../orderParse';

const MENU = [
  { id: 'croissant', name: 'Classic Croissant', sellingPrice: 120 },
  { id: 'brownie', name: 'Fudge Brownie', sellingPrice: 80 },
  { id: 'sourdough', name: 'Sourdough Loaf 500 g', sellingPrice: 250 },
];
const ids = MENU.map(m => m.id);
const full = (over: Record<string, any> = {}) => ({
  lineItems: [], customerLabel: null, customerName: null, when: null, deliveryAddress: null,
  paymentStatus: null, paymentMethod: null, discountAmount: null, discountPercent: null, notes: null, advanceAmount: null, ...over,
});
const check = (raw: any, text: string) => validateParsedOrder(raw, { text, menuIds: ids });
const problemsOf = (r: ReturnType<typeof check>) => (r.ok === false ? r.problems.join(' | ') : '');

describe('aiPrivacy', () => {
  it('removes phone numbers however they are written, and hands them back', () => {
    const r = redactPhones('Call +91 98450 10101 or 98450-20202 or (080) 2345 6789 now');
    expect(r.text).toBe('Call [number] or [number] or [number] now');
    expect(r.phones).toEqual(['+91 98450 10101', '98450-20202', '(080) 2345 6789']);
  });

  it('leaves quantities, prices, dates and short numbers alone', () => {
    const t = '2 croissants for Rs 240 on 12/10/2026, order 1234567';
    expect(redactPhones(t).text).toBe(t);
  });

  it('replaces known customers by label, a first name only when it is unique', () => {
    const customers = [{ name: 'Priya Sharma', label: 'C-AAAA' }, { name: 'Rahul Verma', label: 'C-BBBB' }, { name: 'Rahul Nair', label: 'C-CCCC' }];
    const r = replaceCustomerNames('Hi, Priya here. Rahul Verma asked too, and Rahul', customers);
    expect(r.text).toBe('Hi, C-AAAA here. C-BBBB asked too, and Rahul');
    expect([...r.mentioned].sort()).toEqual(['C-AAAA', 'C-BBBB']);
  });
});

describe('prepareOrderText', () => {
  it('sends the message with phone numbers and known names taken out, and keeps them for the app', () => {
    const customers = [{ name: 'Priya Sharma', label: 'C-AAAA' }];
    const r = prepareOrderText('Hi this is Priya Sharma\n\n\n\n2 croissants please. My number is +91 98450 10101', customers);
    expect(r.text).toBe('Hi this is C-AAAA\n\n2 croissants please. My number is [phone]');
    expect(r.phones).toEqual(['+91 98450 10101']);
    expect(r.mentioned).toEqual(['C-AAAA']);
    expect(r.text).not.toContain('Priya');
    expect(r.text).not.toContain('98450');
  });

  it('keeps a long message within the limit', () => {
    expect(prepareOrderText('x '.repeat(2000), []).text.length).toBeLessThanOrEqual(ORDER_TEXT_MAX_CHARS);
  });
});

describe('quantityAppears and numberAppears', () => {
  it('accepts a quantity that is written, in digits or words, and one', () => {
    expect(quantityAppears(2, '2 croissants')).toBe(true);
    expect(quantityAppears(3, 'three brownies pls')).toBe(true);
    expect(quantityAppears(1, 'a croissant')).toBe(true);
    expect(quantityAppears(12, 'a dozen brownies')).toBe(true);
    expect(quantityAppears(6, 'half a dozen brownies')).toBe(true);
    expect(quantityAppears(24, '2 dozen brownies')).toBe(true);
    expect(quantityAppears(2, 'a couple of croissants')).toBe(true);
  });

  it('refuses a quantity the message does not give', () => {
    expect(quantityAppears(5, '2 croissants and 3 brownies')).toBe(false);
    expect(quantityAppears(24, 'a dozen brownies')).toBe(false);
    expect(quantityAppears(7, 'croissants')).toBe(false);
  });

  it('finds a number written in digits, with commas and decimals', () => {
    expect(numberAppears(1200, 'discount of Rs 1,200')).toBe(true);
    expect(numberAppears(12.5, '12.5% off')).toBe(true);
    expect(numberAppears(10, 'discount of ten')).toBe(false);
    expect(numberAppears(5, 'order 15')).toBe(false);
  });
});

describe('validateParsedOrder', () => {
  const text = 'Hi, Priya here. 2 croisant and a dozen Fudge Brownie for Saturday please, 10% off. Deliver to 12 MG Road, Bengaluru. Will pay by UPI.';

  it('accepts a reading that is in the message and keeps only what is there', () => {
    const r = check(full({
      lineItems: [{ nameAsWritten: 'croisant', menuItemId: 'croissant', quantity: 2 }, { nameAsWritten: 'Fudge Brownie', menuItemId: 'brownie', quantity: 12 }],
      customerName: 'Priya', when: 'Saturday', deliveryAddress: '12 MG Road, Bengaluru', paymentMethod: 'upi', discountPercent: 10,
    }), text);
    expect(r).toEqual({
      ok: true,
      parsed: {
        lineItems: [{ nameAsWritten: 'croisant', menuItemId: 'croissant', quantity: 2 }, { nameAsWritten: 'Fudge Brownie', menuItemId: 'brownie', quantity: 12 }],
        customerName: 'Priya', when: 'Saturday', deliveryAddress: '12 MG Road, Bengaluru', paymentMethod: 'upi', discountPercent: 10,
      },
    });
  });

  it('keeps an item that is not on the menu, with a null id', () => {
    const r = check(full({ lineItems: [{ nameAsWritten: 'croisant', menuItemId: null, quantity: 2 }] }), text);
    expect(r.ok && r.parsed.lineItems).toEqual([{ nameAsWritten: 'croisant', menuItemId: null, quantity: 2 }]);
  });

  it('refuses a quantity that is not in the message', () => {
    expect(problemsOf(check(full({ lineItems: [{ nameAsWritten: 'croisant', menuItemId: 'croissant', quantity: 5 }] }), text))).toMatch(/quantity 5 is not written/);
  });

  it('refuses a made-up menu id, an item name that is not in the message, and bad quantities', () => {
    expect(problemsOf(check(full({ lineItems: [{ nameAsWritten: 'croisant', menuItemId: 'invented', quantity: 2 }] }), text))).toMatch(/not one of the menu items/);
    expect(problemsOf(check(full({ lineItems: [{ nameAsWritten: 'cheesecake', menuItemId: null, quantity: 1 }] }), text))).toMatch(/not written in the message/);
    for (const quantity of [0, -1, 1.5, 1000, '2', null]) {
      expect(check(full({ lineItems: [{ nameAsWritten: 'croisant', menuItemId: null, quantity }] }), text).ok, String(quantity)).toBe(false);
    }
  });

  it('refuses a name, phrase or address that is not in the message', () => {
    expect(problemsOf(check(full({ customerName: 'Anita' }), text))).toMatch(/customerName/);
    expect(problemsOf(check(full({ when: 'next Tuesday' }), text))).toMatch(/when/);
    expect(problemsOf(check(full({ deliveryAddress: '99 Park Street' }), text))).toMatch(/deliveryAddress/);
  });

  it('refuses a discount that is not a number in the message', () => {
    expect(problemsOf(check(full({ discountAmount: 50 }), text))).toMatch(/discountAmount/);
    expect(problemsOf(check(full({ discountPercent: 15 }), text))).toMatch(/discountPercent/);
    expect(problemsOf(check(full({ discountPercent: 500 }), 'discount 500'))).toMatch(/discountPercent/);
    expect(check(full({ discountAmount: 50 }), 'Rs 50 off').ok).toBe(true);
  });

  it('accepts only a customer label that is in the message, and prefers it to a name', () => {
    expect(check(full({ customerLabel: 'C-4F2A' }), 'Hi this is C-4F2A, 2 croissants').ok).toBe(true);
    expect(problemsOf(check(full({ customerLabel: 'C-4F2A' }), 'Hi, 2 croissants'))).toMatch(/customerLabel/);
    expect(problemsOf(check(full({ customerLabel: 'Priya' }), 'Hi Priya'))).toMatch(/customerLabel/);
    const both = check(full({ customerLabel: 'C-4F2A', customerName: 'C-4F2A' }), 'Hi C-4F2A');
    expect(both.ok && both.parsed.customerName).toBeUndefined();
  });

  it('accepts notes and an advance that are written in the message', () => {
    const t = 'A cake for Saturday please, "Happy birthday Asha", eggless. I paid Rs 500 advance on UPI.';
    const r = check(full({ notes: 'Happy birthday Asha, eggless', advanceAmount: 500, paymentMethod: 'upi' }), t);
    expect(r).toEqual({ ok: true, parsed: { lineItems: [], notes: 'Happy birthday Asha, eggless', advanceAmount: 500, paymentMethod: 'upi' } });
  });

  it('refuses notes that are not in the message, and an advance that is not a number written in it', () => {
    expect(problemsOf(check(full({ notes: 'No nuts please' }), 'a cake for Saturday'))).toMatch(/notes/);
    expect(problemsOf(check(full({ advanceAmount: 300 }), 'I paid Rs 500 advance'))).toMatch(/advanceAmount/);
    expect(problemsOf(check(full({ advanceAmount: 500 }), 'I will pay an advance'))).toMatch(/advanceAmount/);
    expect(problemsOf(check(full({ advanceAmount: -5 }), 'paid 5'))).toMatch(/advanceAmount/);
    expect(problemsOf(check(full({ notes: 'x'.repeat(301) }), 'x'.repeat(400)))).toMatch(/notes/);
  });

  it('refuses unknown payment values and a wrong shape', () => {
    expect(problemsOf(check(full({ paymentStatus: 'maybe' }), text))).toMatch(/paymentStatus/);
    expect(problemsOf(check(full({ paymentMethod: 'bitcoin' }), text))).toMatch(/paymentMethod/);
    for (const raw of [null, 'x', [], 5]) expect(check(raw, text).ok).toBe(false);
    expect(check(full({ lineItems: 'x' }), text).ok).toBe(false);
    expect(check(full({ lineItems: Array.from({ length: ORDER_MAX_ITEMS + 1 }, () => ({ nameAsWritten: 'a', menuItemId: null, quantity: 1 })) }), 'a').ok).toBe(false);
  });

  it('treats a missing or blank field as not said, and accepts a message with no items', () => {
    const r = check({ lineItems: [], customerName: '  ', when: '' }, 'hello there');
    expect(r).toEqual({ ok: true, parsed: { lineItems: [] } });
  });

  it('asks for every field, and nothing else', () => {
    expect(ORDER_SCHEMA.required).toEqual(Object.keys(ORDER_SCHEMA.properties));
    expect(ORDER_SCHEMA.additionalProperties).toBe(false);
  });
});

describe('resolveWhen', () => {
  const SUN = '2026-10-04'; // a Sunday
  it('understands today, tomorrow and yesterday', () => {
    expect(resolveWhen('today', SUN)).toBe('2026-10-04');
    expect(resolveWhen('Tonight', SUN)).toBe('2026-10-04');
    expect(resolveWhen('tomorrow evening', SUN)).toBe('2026-10-05');
    expect(resolveWhen('tmrw', SUN)).toBe('2026-10-05');
    expect(resolveWhen('day after tomorrow', SUN)).toBe('2026-10-06');
    expect(resolveWhen('yesterday', SUN)).toBe('2026-10-03');
  });

  it('finds the next weekday, today if it is that day, and "next" skips today', () => {
    expect(resolveWhen('Saturday', SUN)).toBe('2026-10-10');
    expect(resolveWhen('this Friday', SUN)).toBe('2026-10-09');
    expect(resolveWhen('sun', SUN)).toBe('2026-10-04');
    expect(resolveWhen('next Sunday', SUN)).toBe('2026-10-11');
    expect(resolveWhen('mon', SUN)).toBe('2026-10-05');
  });

  it('reads dates written with a month name, either way round', () => {
    expect(resolveWhen('12 Oct', SUN)).toBe('2026-10-12');
    expect(resolveWhen('12th October', SUN)).toBe('2026-10-12');
    expect(resolveWhen('Oct 12', SUN)).toBe('2026-10-12');
    expect(resolveWhen('1st of November', SUN)).toBe('2026-11-01');
  });

  it('reads day-first numeric dates, and rolls into next year when the date has passed', () => {
    expect(resolveWhen('12/10', SUN)).toBe('2026-10-12');
    expect(resolveWhen('12-10-2026', SUN)).toBe('2026-10-12');
    expect(resolveWhen('5/1', SUN)).toBe('2027-01-05');
    expect(resolveWhen('1/10', SUN)).toBe('2026-10-01'); // just passed: still this year
  });

  it('gives null for an impossible date or a phrase it cannot read', () => {
    expect(resolveWhen('31/2', SUN)).toBeNull();
    expect(resolveWhen('30 Feb', SUN)).toBeNull();
    expect(resolveWhen('sometime soon', SUN)).toBeNull();
    expect(resolveWhen('', SUN)).toBeNull();
    expect(resolveWhen('13/13/2026', SUN)).toBeNull();
  });
});

describe('suggestMenuItem', () => {
  it('suggests the menu item a misspelt or shortened name means', () => {
    expect(suggestMenuItem('croisant', MENU)?.id).toBe('croissant');
    expect(suggestMenuItem('Croissants', MENU)?.id).toBe('croissant');
    expect(suggestMenuItem('brownies', MENU)?.id).toBe('brownie');
    expect(suggestMenuItem('sour dough', MENU)?.id).toBe('sourdough');
    expect(suggestMenuItem('chocolate fudge brownie', MENU)?.id).toBe('brownie');
  });

  it('suggests nothing when nothing is close, or the name is tiny', () => {
    expect(suggestMenuItem('cheesecake', MENU)).toBeNull();
    expect(suggestMenuItem('pizza', MENU)).toBeNull();
    expect(suggestMenuItem('ab', MENU)).toBeNull();
    expect(suggestMenuItem('croissant', [])).toBeNull();
  });
});

describe('buildOrderForm', () => {
  const today = '2026-10-04';
  const customers = [{ label: 'C-AAAA', name: 'Priya Sharma', phone: '+91 98450 10101' }];
  const form = (parsed: any, phones: string[] = []) => buildOrderForm({ parsed: { lineItems: [], ...parsed }, menu: MENU, customers, phones, today });

  it('fills items, merging an item written twice, and lists what was not found with a suggestion', () => {
    const f = form({ lineItems: [
      { nameAsWritten: 'croissant', menuItemId: 'croissant', quantity: 2 },
      { nameAsWritten: 'croissants', menuItemId: 'croissant', quantity: 1 },
      { nameAsWritten: 'brownies', menuItemId: null, quantity: 3 },
      { nameAsWritten: 'cheesecake', menuItemId: null, quantity: 1 },
    ] });
    expect(f.lineItems).toEqual([{ menuItemId: 'croissant', quantity: 3 }]);
    expect(f.notFound).toEqual([
      { nameAsWritten: 'brownies', quantity: 3, suggestion: { id: 'brownie', name: 'Fudge Brownie', sellingPrice: 80 } },
      { nameAsWritten: 'cheesecake', quantity: 1, suggestion: null },
    ]);
  });

  it('never applies a suggestion: an unmatched item is never added to the order', () => {
    expect(form({ lineItems: [{ nameAsWritten: 'brownies', menuItemId: null, quantity: 3 }] }).lineItems).toEqual([]);
  });

  it('treats an id that is not on the menu as not found', () => {
    expect(form({ lineItems: [{ nameAsWritten: 'ghost', menuItemId: 'deleted', quantity: 1 }] }).notFound).toHaveLength(1);
  });

  it('fills the notes and the advance, and the method the advance was paid by', () => {
    expect(form({ notes: 'eggless', advanceAmount: 200, paymentMethod: 'upi' })).toMatchObject({ notes: 'eggless', advanceAmount: 200, advanceMethod: 'upi' });
    const noMethod = form({ advanceAmount: 200 });
    expect(noMethod.advanceAmount).toBe(200);
    expect(noMethod.advanceMethod).toBeUndefined();
    expect(form({}).notes).toBeUndefined();
    expect(form({}).advanceAmount).toBeUndefined();
  });

  it('takes a known customer\'s name and phone from their own record, not from the message', () => {
    const f = form({ customerLabel: 'C-AAAA' }, ['+91 11111 11111']);
    expect(f).toMatchObject({ customerName: 'Priya Sharma', customerPhone: '+91 98450 10101', knownCustomer: true });
  });

  it('takes a new customer\'s name from the message and the phone number found in it', () => {
    expect(form({ customerName: 'Anita' }, ['+91 22222 22222'])).toMatchObject({ customerName: 'Anita', customerPhone: '+91 22222 22222', knownCustomer: false });
    expect(form({ customerLabel: 'C-ZZZZ' }).knownCustomer).toBe(false);
  });

  it('resolves the date, or says what it could not read', () => {
    expect(form({ when: 'tomorrow' }).date).toBe('2026-10-05');
    const f = form({ when: 'sometime soon' });
    expect(f.date).toBeUndefined();
    expect(f.dateNotUnderstood).toBe('sometime soon');
  });

  it('fills payment, with no method for an order paid later, and the address', () => {
    expect(form({ paymentStatus: 'paid', paymentMethod: 'upi', deliveryAddress: '12 MG Road' })).toMatchObject({ payLater: false, method: 'upi', deliveryAddress: '12 MG Road' });
    const later = form({ paymentStatus: 'unpaid', paymentMethod: 'cash' });
    expect(later.payLater).toBe(true);
    expect(later.method).toBeUndefined();
    expect(form({}).payLater).toBeUndefined();
  });

  it('works out a percentage discount from the order\'s own value, in the app', () => {
    const items = [{ nameAsWritten: 'croissant', menuItemId: 'croissant', quantity: 2 }, { nameAsWritten: 'brownie', menuItemId: 'brownie', quantity: 1 }];
    expect(form({ lineItems: items, discountPercent: 10 }).discountAmount).toBe(32); // 10% of 240 + 80
    expect(form({ lineItems: items, discountPercent: 12.5 }).discountAmount).toBe(40);
    expect(form({ discountPercent: 10 }).discountAmount).toBeUndefined(); // nothing to take it off
  });

  it('uses an amount discount as written, but never more than the order is worth', () => {
    const items = [{ nameAsWritten: 'brownie', menuItemId: 'brownie', quantity: 1 }];
    expect(form({ lineItems: items, discountAmount: 30 }).discountAmount).toBe(30);
    expect(form({ lineItems: items, discountAmount: 500 }).discountAmount).toBe(80);
  });
});
