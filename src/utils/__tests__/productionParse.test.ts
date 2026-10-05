import { describe, it, expect } from 'vitest';
import {
  buildProductionForm, PRODUCTION_SCHEMA, prepareProductionText, resolveProductionDate, validateParsedProduction,
} from '../productionParse';

const menuIds = ['croissant', 'muffin', 'loaf'];
const menu = [
  { id: 'croissant', name: 'Butter Croissant' },
  { id: 'muffin', name: 'Chocolate Muffin' },
  { id: 'loaf', name: 'Whole Wheat Atta Loaf' },
];
const line = (over: Record<string, unknown> = {}) => ({ nameAsWritten: 'croissants', menuItemId: 'croissant', quantity: 40, wasteUnits: null, ...over });
const reading = (over: Record<string, unknown> = {}) => ({ lineItems: [line()], when: null, notes: null, ...over });
const check = (raw: unknown, text: string) => validateParsedProduction(raw, { text, menuIds });
const problemsOf = (raw: unknown, text: string) => { const r = check(raw, text); return r.ok === false ? r.problems : []; };

describe('PRODUCTION_SCHEMA', () => {
  it('has every field present, null meaning "not in the message", and no extras', () => {
    expect(PRODUCTION_SCHEMA.required).toEqual(['lineItems', 'when', 'notes']);
    expect(PRODUCTION_SCHEMA.additionalProperties).toBe(false);
    expect(PRODUCTION_SCHEMA.properties.lineItems.items.required).toEqual(['nameAsWritten', 'menuItemId', 'quantity', 'wasteUnits']);
  });
});

describe('prepareProductionText', () => {
  it('tidies whitespace and removes phone numbers', () => {
    expect(prepareProductionText('  Made 40   croissants\r\n\r\n\r\n\r\ncall +91 98450 10101  ')).toBe('Made 40 croissants\n\ncall [phone]');
  });
  it('limits the length', () => {
    expect(prepareProductionText('x'.repeat(3000)).length).toBe(1500);
  });
});

describe('validateParsedProduction', () => {
  const text = 'Made 40 croissants and 24 muffins this morning, 3 croissants burnt';

  it('accepts a reading that is all in the message', () => {
    const r = check(reading({
      lineItems: [line({ wasteUnits: 3 }), line({ nameAsWritten: 'muffins', menuItemId: 'muffin', quantity: 24 })], when: 'this morning',
    }), text);
    expect(r).toEqual({
      ok: true,
      parsed: { lineItems: [{ nameAsWritten: 'croissants', menuItemId: 'croissant', quantity: 40, wasteUnits: 3 }, { nameAsWritten: 'muffins', menuItemId: 'muffin', quantity: 24 }], when: 'this morning' },
    });
  });

  it('accepts an item that is not on the menu, with a null id', () => {
    expect(check(reading({ lineItems: [line({ nameAsWritten: 'croissants', menuItemId: null })] }), text).ok).toBe(true);
  });

  it('refuses a quantity that is not written: a production quantity is never assumed', () => {
    expect(problemsOf(reading({ lineItems: [line({ quantity: 50 })] }), text)).toEqual([expect.stringMatching(/quantity 50 is not written/)]);
    expect(problemsOf(reading({ lineItems: [line({ quantity: 1 })] }), 'Made croissants this morning')).toEqual([expect.stringMatching(/quantity 1 is not written/)]);
  });

  it('accepts one when it is written as "a croissant", "one" or "1"', () => {
    expect(check(reading({ lineItems: [line({ quantity: 1 })] }), 'Made a croissants test').ok).toBe(true);
    expect(check(reading({ lineItems: [line({ nameAsWritten: 'cake', quantity: 1 })] }), 'baked one cake for the shop').ok).toBe(true);
    expect(check(reading({ lineItems: [line({ nameAsWritten: 'cake', quantity: 1 })] }), 'baked 1 cake').ok).toBe(true);
  });

  it('accepts quantities in words, and "2 dozen" as 24', () => {
    expect(check(reading({ lineItems: [line({ nameAsWritten: 'muffins', menuItemId: 'muffin', quantity: 24 })] }), 'Made 2 dozen muffins').ok).toBe(true);
    expect(check(reading({ lineItems: [line({ quantity: 12 })] }), 'Made twelve croissants').ok).toBe(true);
    expect(check(reading({ lineItems: [line({ quantity: 6 })] }), 'Made half a dozen croissants').ok).toBe(true);
  });

  it('refuses a name that is not in the message, and an id that is not on the menu', () => {
    expect(problemsOf(reading({ lineItems: [line({ nameAsWritten: 'baguettes' })] }), text)).toEqual([expect.stringMatching(/"baguettes" is not written/)]);
    expect(problemsOf(reading({ lineItems: [line({ menuItemId: 'nope' })] }), text)).toEqual([expect.stringMatching(/not one of the menu items/)]);
  });

  it('refuses a bad quantity, however it is written', () => {
    for (const quantity of [0, -3, 2.5, '40', null, 100000]) {
      expect(check(reading({ lineItems: [line({ quantity })] }), text).ok, String(quantity)).toBe(false);
    }
  });

  it('checks waste: written in the message, a whole number, and no more than was made', () => {
    expect(check(reading({ lineItems: [line({ wasteUnits: 3 })] }), text).ok).toBe(true);
    expect(problemsOf(reading({ lineItems: [line({ wasteUnits: 4 })] }), text)).toEqual([expect.stringMatching(/waste 4 is not written/)]);
    expect(problemsOf(reading({ lineItems: [line({ wasteUnits: 50 })] }), 'Made 40 croissants, 50 burnt')).toEqual([expect.stringMatching(/more than the quantity made/)]);
    expect(check(reading({ lineItems: [line({ wasteUnits: 0 })] }), text).ok).toBe(false);
    expect(check(reading({ lineItems: [line({ wasteUnits: 1.5 })] }), text).ok).toBe(false);
  });

  it('checks the date phrase and notes are text from the message', () => {
    expect(check(reading({ when: 'this morning' }), text).ok).toBe(true);
    expect(problemsOf(reading({ when: 'last Tuesday' }), text)).toEqual([expect.stringMatching(/when is not a phrase written/)]);
    expect(check(reading({ notes: 'new oven' }), 'Made 40 croissants in the new oven').ok).toBe(true);
    expect(problemsOf(reading({ notes: 'new oven' }), text)).toEqual([expect.stringMatching(/notes is not text written/)]);
  });

  it('allows no items at all, and refuses too many', () => {
    expect(check(reading({ lineItems: [] }), 'Nothing made today').ok).toBe(true);
    expect(check(reading({ lineItems: Array.from({ length: 16 }, () => line()) }), text).ok).toBe(false);
  });

  it('refuses answers that are not shaped right', () => {
    for (const raw of [null, undefined, 'x', 5, [], { lineItems: 'x' }, { lineItems: [null] }, { lineItems: [{ quantity: 3 }] }]) {
      expect(check(raw, text).ok, JSON.stringify(raw)).toBe(false);
    }
  });

  it('treats blank strings as "not said"', () => {
    expect(check(reading({ when: '  ', notes: '' }), text).ok).toBe(true);
  });
});

describe('resolveProductionDate', () => {
  const TODAY = '2026-10-07'; // a Wednesday
  it('understands today, this morning and just now', () => {
    for (const p of ['today', 'this morning', 'This evening', 'tonight', 'just now', 'earlier']) expect(resolveProductionDate(p, TODAY), p).toBe(TODAY);
  });
  it('understands yesterday, last night and the day before', () => {
    expect(resolveProductionDate('yesterday', TODAY)).toBe('2026-10-06');
    expect(resolveProductionDate('last night', TODAY)).toBe('2026-10-06');
    expect(resolveProductionDate('the day before yesterday', TODAY)).toBe('2026-10-05');
  });
  it('takes a weekday as the most recent one, today if it is that day, a week back for "last"', () => {
    expect(resolveProductionDate('Monday', TODAY)).toBe('2026-10-05');
    expect(resolveProductionDate('on Saturday', TODAY)).toBe('2026-10-03');
    expect(resolveProductionDate('Wednesday', TODAY)).toBe(TODAY);
    expect(resolveProductionDate('last Wednesday', TODAY)).toBe('2026-09-30');
    expect(resolveProductionDate('last Saturday', TODAY)).toBe('2026-10-03');
  });
  it('understands a day and month, and a day/month, when they are not in the future', () => {
    expect(resolveProductionDate('3 Oct', TODAY)).toBe('2026-10-03');
    expect(resolveProductionDate('3/10', TODAY)).toBe('2026-10-03');
    expect(resolveProductionDate('12th September', TODAY)).toBe('2026-09-12');
  });
  it('does not understand the future or nonsense', () => {
    for (const p of ['tomorrow', 'next Friday', '20 Oct', '', 'sometime', 'soon']) expect(resolveProductionDate(p, TODAY), p).toBeNull();
  });
});

describe('buildProductionForm', () => {
  const TODAY = '2026-10-07';
  const parsed = (over: Record<string, unknown> = {}) => ({ lineItems: [{ nameAsWritten: 'croissants', menuItemId: 'croissant', quantity: 40 }], ...over }) as any;
  const build = (p: any) => buildProductionForm({ parsed: p, menu, today: TODAY });

  it('fills the rows, the date and the notes', () => {
    const f = build(parsed({
      lineItems: [{ nameAsWritten: 'croissants', menuItemId: 'croissant', quantity: 40 }, { nameAsWritten: 'muffins', menuItemId: 'muffin', quantity: 24 }],
      when: 'yesterday', notes: 'new oven',
    }));
    expect(f.rows).toEqual([{ recipeId: 'croissant', quantity: 40 }, { recipeId: 'muffin', quantity: 24 }]);
    expect(f.date).toBe('2026-10-06');
    expect(f.notes).toBe('new oven');
    expect(f.notFound).toEqual([]);
  });

  it('adds up the same item written twice', () => {
    const f = build(parsed({ lineItems: [{ nameAsWritten: 'croissants', menuItemId: 'croissant', quantity: 20 }, { nameAsWritten: 'croissants', menuItemId: 'croissant', quantity: 20 }] }));
    expect(f.rows).toEqual([{ recipeId: 'croissant', quantity: 40 }]);
  });

  it('works the sellable yield out from the waste for a single item (the model does no sums)', () => {
    const f = build(parsed({ lineItems: [{ nameAsWritten: 'croissants', menuItemId: 'croissant', quantity: 40, wasteUnits: 3 }] }));
    expect(f.yieldQty).toBe(37);
    expect(f.unplacedWaste).toEqual([]);
  });

  it('cannot place waste for more than one item, so it says so by name', () => {
    const f = build(parsed({
      lineItems: [{ nameAsWritten: 'croissants', menuItemId: 'croissant', quantity: 40, wasteUnits: 3 }, { nameAsWritten: 'muffins', menuItemId: 'muffin', quantity: 24 }],
    }));
    expect(f.yieldQty).toBeUndefined();
    expect(f.unplacedWaste).toEqual([{ name: 'Butter Croissant', units: 3 }]);
  });

  it('lists an item not on the menu with the closest menu item as a suggestion, and its waste as unplaced', () => {
    const f = build(parsed({ lineItems: [{ nameAsWritten: 'croisant', menuItemId: null, quantity: 12, wasteUnits: 2 }] }));
    expect(f.rows).toEqual([]);
    expect(f.notFound).toEqual([{ nameAsWritten: 'croisant', quantity: 12, suggestion: { id: 'croissant', name: 'Butter Croissant' } }]);
    expect(f.unplacedWaste).toEqual([{ name: 'croisant', units: 2 }]);
    expect(f.yieldQty).toBeUndefined();
  });

  it('does not set a yield for a single matched item when another item was not found', () => {
    const f = build(parsed({
      lineItems: [{ nameAsWritten: 'croissants', menuItemId: 'croissant', quantity: 40, wasteUnits: 3 }, { nameAsWritten: 'zzz', menuItemId: null, quantity: 5 }],
    }));
    expect(f.yieldQty).toBeUndefined();
    expect(f.unplacedWaste).toEqual([{ name: 'Butter Croissant', units: 3 }]);
  });

  it('says so when the date cannot be understood, and leaves it unset', () => {
    const f = build(parsed({ when: 'tomorrow' }));
    expect(f.date).toBeUndefined();
    expect(f.dateNotUnderstood).toBe('tomorrow');
  });

  it('never gives a yield below zero', () => {
    expect(build(parsed({ lineItems: [{ nameAsWritten: 'c', menuItemId: 'croissant', quantity: 3, wasteUnits: 3 }] })).yieldQty).toBe(0);
  });
});
