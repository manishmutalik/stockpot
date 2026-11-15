import { describe, expect, it } from 'vitest';
import { duplicatesOf, isPlaceholderName, maybeSameItemName, nameKey, sameItemName, similarItems } from '../duplicates';

describe('nameKey', () => {
  it('sets aside case, spacing, punctuation, plurals and pack sizes', () => {
    expect(nameKey('  Eggs ')).toBe('egg');
    expect(nameKey('Butter (500 g)')).toBe('butter');
    expect(nameKey('Butter 1kg')).toBe('butter');
    expect(nameKey('Choco-chips, dark')).toBe('choco chip dark');
    expect(nameKey('Strawberries')).toBe('strawberry');
    expect(nameKey('Tomatoes')).toBe('tomato');
    expect(nameKey('Swiss cheese')).toBe('swiss cheese');
  });
});

describe('the same item under two names', () => {
  it('matches the same name written differently', () => {
    expect(sameItemName('Eggs', 'egg')).toBe(true);
    expect(sameItemName('Unsalted Butter', 'unsalted  butter')).toBe(true);
    expect(sameItemName('Amul Butter 500 g', 'Amul butter')).toBe(true);
  });

  it('matches names the kitchen table says are one thing', () => {
    expect(sameItemName('Chini', 'Sugar')).toBe(true);
    expect(sameItemName('Maida', 'All purpose flour')).toBe(true);
    expect(sameItemName('Makhan', 'butter')).toBe(true);
    expect(sameItemName('दूध', 'Milk')).toBe(true);
  });

  it('keeps apart what the table keeps apart, and different things', () => {
    expect(sameItemName('Sugar', 'Icing Sugar')).toBe(false);
    expect(sameItemName('Sugar', 'Brown Sugar')).toBe(false);
    expect(sameItemName('Butter', 'Unsalted Butter')).toBe(false);
    expect(sameItemName('Milk', 'Milk powder')).toBe(false);
  });

  it('never calls a new, unnamed item a duplicate', () => {
    expect(isPlaceholderName('New Raw Materials Item')).toBe(true);
    expect(isPlaceholderName('')).toBe(true);
    expect(sameItemName('New Raw Materials Item', 'New Raw Materials Item')).toBe(false);
    expect(sameItemName('', '')).toBe(false);
  });
});

describe('perhaps the same item', () => {
  it('asks when the table puts both under one thing', () => {
    expect(maybeSameItemName('Amul Butter', 'Butter')).toBe(true);
    expect(maybeSameItemName('Salted Butter', 'Unsalted Butter')).toBe(true);
    expect(maybeSameItemName('Full cream milk', 'Milk')).toBe(true);
  });

  it('asks when one name it does not know ends with the whole of the other', () => {
    expect(maybeSameItemName('Malai Paneer', 'paneer')).toBe(true);
    expect(maybeSameItemName('Paneer', 'Paneer tikka masala')).toBe(false);
  });

  it('does not ask about what is plainly the same, or plainly different', () => {
    expect(maybeSameItemName('Chini', 'Sugar')).toBe(false);
    expect(maybeSameItemName('Sugar', 'Icing sugar')).toBe(false);
    expect(maybeSameItemName('Milk', 'Milk powder')).toBe(false);
    expect(maybeSameItemName('Paneer', 'Cheese')).toBe(false);
  });
});

describe('finding them in the inventory', () => {
  const items = [
    { id: 'a', name: 'Sugar' },
    { id: 'b', name: 'Chini' },
    { id: 'c', name: 'Amul Butter' },
    { id: 'd', name: 'Butter' },
    { id: 'e', name: 'Icing Sugar' },
    { id: 'f', name: 'New Raw Materials Item' },
    { id: 'g', name: 'New Raw Materials Item' },
  ];

  it('lists, for a name being typed, the items it is or may be, leaving out itself', () => {
    expect(similarItems('sugar', items, 'a')).toEqual({ same: [{ id: 'b', name: 'Chini' }], maybe: [] });
    expect(similarItems('Butter', items, 'd')).toEqual({ same: [], maybe: [{ id: 'c', name: 'Amul Butter' }] });
  });

  it('flags each item that has a twin, with its twins', () => {
    const found = duplicatesOf(items);
    expect([...found.keys()]).toEqual(['a', 'b']);
    expect(found.get('a')).toEqual([{ id: 'b', name: 'Chini' }]);
  });
});
