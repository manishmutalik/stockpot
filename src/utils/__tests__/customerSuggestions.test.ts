import { describe, it, expect } from 'vitest';
import {
  buildCustomerDirectory, buildCustomerProfiles, groupOrdersByCustomer, matchCustomers, SUGGEST_LIMIT, type CustomerSuggestion,
} from '../customers';
import { addDays } from '../localDate';

const TODAY = '2026-06-30';
const daysAgo = (n: number) => addDays(TODAY, -n);

const materials: any[] = [{ id: 'flour', unit: 'kg', costPerUnit: 40, category: 'Raw Materials' }];
const menu: any[] = [
  { id: 'cake', name: 'Chocolate Truffle Cake', sellingPrice: 100, recipe: [] },
  { id: 'cookie', name: 'Cookie', sellingPrice: 10, recipe: [] },
];
let n = 0;
const order = (over: Record<string, any> = {}): any => ({
  id: `o${String(++n).padStart(3, '0')}`, menuItemId: 'cake', quantity: 1, date: daysAgo(1),
  unitPriceAtSale: 100, unitIngredientCostAtSale: 20, unitPackagingCostAtSale: 0, unitInputGstAtSale: 0, itemNameAtSale: 'Chocolate Truffle Cake',
  customerName: 'Priya Sharma', customerPhone: '+91 98450 10101', ...over,
});
const dir = (orders: any[]) => buildCustomerDirectory(orders, menu);
const person = (name: string, phone: string | undefined, lastOrder: string, over: Partial<CustomerSuggestion> = {}): CustomerSuggestion => ({
  key: `k-${name}-${phone}`, name, ...(phone && { phone }), lastOrder, orderCount: 1, ...over,
});

describe('buildCustomerDirectory', () => {
  it('merges the same phone number typed differently into one entry, newest name and phone winning', () => {
    const d = dir([
      order({ customerPhone: '+91 98450 10101', customerName: 'Priya', date: daysAgo(20) }),
      order({ customerPhone: '9845010101', customerName: 'Priya Sharma', date: daysAgo(5) }),
      order({ customerPhone: '098450-10101', customerName: 'Priya S', date: daysAgo(40) }),
    ]);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ name: 'Priya Sharma', phone: '9845010101', lastOrder: daysAgo(5), orderCount: 3 });
  });

  it('counts a multi-item order once', () => {
    const d = dir([
      order({ orderGroupId: 'g1', date: daysAgo(3) }), order({ orderGroupId: 'g1', menuItemId: 'cookie', date: daysAgo(3) }),
      order({ date: daysAgo(10) }),
    ]);
    expect(d[0].orderCount).toBe(2);
  });

  it('leaves out orders with neither a name nor a phone', () => {
    expect(dir([order({ customerName: undefined, customerPhone: undefined }), order({ customerName: '  ', customerPhone: '' })])).toEqual([]);
  });

  it('picks the item they order most, by quantity, for recognition', () => {
    const d = dir([order({ quantity: 1 }), order({ menuItemId: 'cookie', itemNameAtSale: 'Cookie', quantity: 6 }), order({ quantity: 2 })]);
    expect(d[0].favouriteItem).toBe('Cookie');
  });

  it('uses the name the item was ordered under when it has since been renamed or removed', () => {
    const d = buildCustomerDirectory([order({ menuItemId: 'deleted', itemNameAtSale: 'Old Cake' })], menu);
    expect(d[0].favouriteItem).toBe('Old Cake');
  });

  it('keeps a customer known only by name, and one known only by phone', () => {
    const d = dir([order({ customerPhone: undefined, customerName: 'Anita' }), order({ customerName: undefined, customerPhone: '9845020202' })]);
    expect(d.find(x => x.name === 'Anita')?.phone).toBeUndefined();
    const phoneOnly = d.find(x => x.phone === '9845020202')!;
    expect(phoneOnly.name).toBe('');
  });

  it('puts the most recent customer first', () => {
    const d = dir([order({ customerName: 'Old', customerPhone: '9000000001', date: daysAgo(30) }), order({ customerName: 'New', customerPhone: '9000000002', date: daysAgo(2) })]);
    expect(d.map(x => x.name)).toEqual(['New', 'Old']);
  });

  it('groups customers exactly as the Customers panel does', () => {
    const orders = [
      order({ customerPhone: '+91 98450 10101' }), order({ customerPhone: '9845010101', customerName: 'Priya' }),
      order({ customerPhone: undefined, customerName: 'Rahul  Verma' }), order({ customerPhone: undefined, customerName: 'rahul verma' }),
      order({ customerPhone: '9845020202', customerName: 'Anita' }), order({ customerName: undefined, customerPhone: undefined }),
    ];
    const profiles = buildCustomerProfiles({ orders, menu, materials, settings: { gstApplicable: false }, today: TODAY });
    const directory = dir(orders);
    expect(directory.map(d => d.key).sort()).toEqual(profiles.map(p => p.key).sort());
    for (const p of profiles) {
      const d = directory.find(x => x.key === p.key)!;
      expect(d.orderCount).toBe(p.orderCount);
      expect(d.lastOrder).toBe(p.lastOrder);
    }
    expect([...groupOrdersByCustomer(orders).keys()].sort()).toEqual(directory.map(d => d.key).sort());
  });
});

describe('matchCustomers by name', () => {
  const d = [
    person('Priya Sharma', '9845010101', daysAgo(12)),
    person('Priyanka Rao', '9845020202', daysAgo(3)),
    person('Anita Priya', '9845030303', daysAgo(1)),
    person('José Álvarez', '9845040404', daysAgo(30)),
    person('', '9845050505', daysAgo(2)),
  ];
  const names = (q: string) => matchCustomers(q, d).map(x => x.name);

  it('starts after one character', () => {
    expect(names('p')).toEqual(['Priyanka Rao', 'Priya Sharma', 'Anita Priya']);
  });

  it('matches the start of the full name or the start of any word, not the middle of a word', () => {
    expect(names('pri')).toContain('Priya Sharma');
    expect(names('sha')).toEqual(['Priya Sharma']);
    expect(names('iya')).toEqual([]);
    expect(names('arma')).toEqual([]);
  });

  it('ranks a full-name prefix above a word prefix, and breaks ties by the most recent order', () => {
    // Two full names start with it (the more recent order first), then the name that has it as a later word.
    expect(names('priya')).toEqual(['Priyanka Rao', 'Priya Sharma', 'Anita Priya']);
  });

  it('ignores case and accents', () => {
    expect(names('JOSE')).toEqual(['José Álvarez']);
    expect(names('alvarez')).toEqual(['José Álvarez']);
    expect(names('Álv')).toEqual(['José Álvarez']);
  });

  it('matches several typed words, each starting a different word of the name', () => {
    expect(names('priya sh')).toEqual(['Priya Sharma']);
    expect(names('sharma pri')).toEqual(['Priya Sharma']);
    expect(names('priya priya')).toEqual([]); // two different words are needed, and no name has two that start that way
  });

  it('shows two people with the same name, each with their own phone', () => {
    const twins = [person('Priya', '9845010101', daysAgo(9)), person('Priya', '9845020202', daysAgo(2))];
    const found = matchCustomers('priya', twins);
    expect(found.map(x => x.phone)).toEqual(['9845020202', '9845010101']);
  });

  it('returns nothing for nothing typed, or for no match, and skips customers with no name', () => {
    expect(names('')).toEqual([]);
    expect(names('   ')).toEqual([]);
    expect(names('zzz')).toEqual([]);
    expect(matchCustomers('x', [person('', '9845050505', daysAgo(1))])).toEqual([]);
  });

  it('is capped at six', () => {
    const many = Array.from({ length: 20 }, (_, i) => person(`Priya ${i}`, `98450${String(i).padStart(5, '0')}`, daysAgo(i)));
    expect(matchCustomers('priya', many)).toHaveLength(SUGGEST_LIMIT);
    expect(matchCustomers('priya', many, 3)).toHaveLength(3);
    expect(matchCustomers('priya', many)[0].name).toBe('Priya 0');
  });
});

describe('matchCustomers by phone', () => {
  const d = [
    person('Priya', '+91 98450 10101', daysAgo(12)),
    person('Rahul', '098450-20202', daysAgo(3)),
    person('Anita', '99001 98450', daysAgo(1)),
    person('NoPhone', undefined, daysAgo(1)),
  ];
  const found = (q: string) => matchCustomers(q, d).map(x => x.name);

  it('needs three digits', () => {
    expect(found('98')).toEqual([]);
    expect(found('984')).toEqual(['Rahul', 'Priya', 'Anita']);
  });

  it('matches digits only, ignoring spaces, dashes, +91 and a leading 0', () => {
    expect(found('98450')).toEqual(['Rahul', 'Priya', 'Anita']);
    expect(found('98 450')).toEqual(['Rahul', 'Priya', 'Anita']);
    expect(found('(98450)')).toEqual(['Rahul', 'Priya', 'Anita']);
  });

  it('ignores a typed +91 and a typed leading 0', () => {
    expect(found('+91 98450 1')).toEqual(['Priya']);
    expect(found('098450 2')).toEqual(['Rahul']);
    expect(found('91 98450 10101')).toEqual(['Priya']);
  });

  it('matches anywhere in the last ten digits, ranking a number that starts with it first, whatever the recency', () => {
    expect(found('984')).toEqual(['Rahul', 'Priya', 'Anita']); // Anita ordered most recently, but hers only has 984 in the middle
    expect(found('450')).toEqual(['Anita', 'Rahul', 'Priya']); // nobody starts with it, so most recent first
    expect(found('0101')).toEqual(['Priya']);
  });

  it('does not match a customer with no phone, or digits in the country code', () => {
    expect(found('919')).toEqual([]);
    expect(matchCustomers('984', [person('NoPhone', undefined, daysAgo(1))])).toEqual([]);
  });

  it('does not treat a typed name as a phone number', () => {
    expect(matchCustomers('9845 abc', d)).toEqual([]); // a letter makes it a name search
    expect(matchCustomers('+', d)).toEqual([]);
  });
});
