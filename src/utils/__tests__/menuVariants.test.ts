import { describe, it, expect } from 'vitest';
import { measureOf, resolveMenuItem } from '../menuVariants';

const BREAD = [
  { id: 'pump350', name: 'Pumpkin Seed Bread (350g)' },
  { id: 'pump500', name: 'Pumpkin Seed Bread (500g)' },
  { id: 'sour', name: 'Sourdough Loaf' },
  { id: 'brown', name: 'Brownie' },
  { id: 'sundae', name: 'Brownie Sundae' },
];
const ask = (r: ReturnType<typeof resolveMenuItem>) => (r.kind === 'ask' ? r.options.map(o => o.id) : r);

describe('measureOf', () => {
  it('reads a weight, volume or length, in grams, millilitres or inches', () => {
    expect(measureOf('Pumpkin Seed Bread (500g)')).toEqual({ dimension: 'weight', amount: 500 });
    expect(measureOf('500gm loaf')).toEqual({ dimension: 'weight', amount: 500 });
    expect(measureOf('1.5 kg cake')).toEqual({ dimension: 'weight', amount: 1500 });
    expect(measureOf('half litre milk 500 ml')).toEqual({ dimension: 'volume', amount: 500 });
    expect(measureOf('2 litre')).toEqual({ dimension: 'volume', amount: 2000 });
    expect(measureOf('8 inch cake')).toEqual({ dimension: 'length', amount: 8 });
    expect(measureOf('two brownies')).toBeNull();
  });
});

describe('resolveMenuItem: several sizes of the same item', () => {
  it('asks which one when only the name is said, and never picks for the owner', () => {
    expect(ask(resolveMenuItem('pumpkin seed bread', BREAD))).toEqual(['pump350', 'pump500']);
    expect(ask(resolveMenuItem('Pumpkin Seed Breads', BREAD))).toEqual(['pump350', 'pump500']);
  });

  it('takes "large" as the heaviest and "small" as the lightest', () => {
    expect(resolveMenuItem('large pumpkin seed bread', BREAD)).toEqual({ kind: 'item', id: 'pump500' });
    expect(resolveMenuItem('big pumpkin seed bread', BREAD)).toEqual({ kind: 'item', id: 'pump500' });
    expect(resolveMenuItem('pumpkin seed bread large', BREAD)).toEqual({ kind: 'item', id: 'pump500' });
    expect(resolveMenuItem('small pumpkin seed bread', BREAD)).toEqual({ kind: 'item', id: 'pump350' });
    expect(resolveMenuItem('mini pumpkin seed bread', BREAD)).toEqual({ kind: 'item', id: 'pump350' });
  });

  it('is pinned by a weight that is said, however it is written', () => {
    expect(resolveMenuItem('500gm pumpkin seed bread', BREAD)).toEqual({ kind: 'item', id: 'pump500' });
    expect(resolveMenuItem('pumpkin seed bread 350 g', BREAD)).toEqual({ kind: 'item', id: 'pump350' });
    expect(resolveMenuItem('500 grams pumpkin seed bread', BREAD)).toEqual({ kind: 'item', id: 'pump500' });
  });

  it('asks when the weight said is not one of them, or the size word cannot choose', () => {
    expect(ask(resolveMenuItem('750g pumpkin seed bread', BREAD))).toEqual(['pump350', 'pump500']);
    expect(ask(resolveMenuItem('regular pumpkin seed bread', BREAD))).toEqual(['pump350', 'pump500']);
    expect(ask(resolveMenuItem('medium pumpkin seed bread', BREAD))).toEqual(['pump350', 'pump500']);
  });

  it('uses the size word in the names when the names have them instead of weights', () => {
    const cakes = [{ id: 'cs', name: 'Chocolate Cake Small' }, { id: 'cl', name: 'Chocolate Cake Large' }];
    expect(resolveMenuItem('large chocolate cake', cakes)).toEqual({ kind: 'item', id: 'cl' });
    expect(resolveMenuItem('big chocolate cake', cakes)).toEqual({ kind: 'item', id: 'cl' });
    expect(resolveMenuItem('small chocolate cake', cakes)).toEqual({ kind: 'item', id: 'cs' });
    expect(ask(resolveMenuItem('chocolate cake', cakes))).toEqual(['cs', 'cl']);
  });

  it('picks the middle of three with "medium" or "regular", and the ends with large and small', () => {
    const three = [{ id: 'a', name: 'Cake 500g' }, { id: 'b', name: 'Cake 1kg' }, { id: 'c', name: 'Cake 2kg' }];
    expect(resolveMenuItem('medium cake', three)).toEqual({ kind: 'item', id: 'b' });
    expect(resolveMenuItem('large cake', three)).toEqual({ kind: 'item', id: 'c' });
    expect(resolveMenuItem('small cake', three)).toEqual({ kind: 'item', id: 'a' });
    expect(resolveMenuItem('1 kg cake', three)).toEqual({ kind: 'item', id: 'b' });
  });

  it('does not rank sizes it cannot compare (no weights, or weights in different units of kind, or equal)', () => {
    const mixed = [{ id: 'a', name: 'Bun 500g' }, { id: 'b', name: 'Bun 1 litre' }];
    expect(ask(resolveMenuItem('large bun', mixed))).toEqual(['a', 'b']);
    const same = [{ id: 'a', name: 'Bun 500g' }, { id: 'b', name: 'Bun 500 gm' }];
    expect(ask(resolveMenuItem('large bun', same))).toEqual(['a', 'b']);
    const bare = [{ id: 'a', name: 'Bun' }, { id: 'b', name: 'Bun Special' }];
    expect(resolveMenuItem('bun', bare)).toEqual({ kind: 'item', id: 'a' });
    expect(resolveMenuItem('half dozen buns', bare)).toEqual({ kind: 'item', id: 'a' });
  });
});

describe('resolveMenuItem: everything else is left as before', () => {
  it('takes an item that is the only whole match, even when a longer name contains it', () => {
    expect(resolveMenuItem('brownie', BREAD)).toEqual({ kind: 'item', id: 'brown' });
    expect(resolveMenuItem('two brownies', BREAD)).toEqual({ kind: 'item', id: 'brown' });
    expect(resolveMenuItem('Sourdough loaf', BREAD)).toEqual({ kind: 'item', id: 'sour' });
  });

  it('treats singular and plural as the same word', () => {
    const menu = [{ id: 'b', name: 'Fruit Berry Tart' }, { id: 'c', name: 'Chocolate Chip Cookie' }, { id: 'e', name: 'Egg Puff' }];
    expect(resolveMenuItem('fruit berries tart', menu)).toEqual({ kind: 'item', id: 'b' });
    expect(resolveMenuItem('chocolate chip cookies', menu)).toEqual({ kind: 'item', id: 'c' });
    expect(resolveMenuItem('egg puffs', menu)).toEqual({ kind: 'item', id: 'e' });
  });

  it('leaves a name it cannot place to the model and the owner', () => {
    expect(resolveMenuItem('choco croissant', BREAD)).toEqual({ kind: 'keep' });
    expect(resolveMenuItem('', BREAD)).toEqual({ kind: 'keep' });
    expect(resolveMenuItem('large', BREAD)).toEqual({ kind: 'keep' });
    expect(resolveMenuItem('sundae', BREAD)).toEqual({ kind: 'keep' }); // one longer name only: the model and the owner decide
  });

  it('asks about a word that fits several different items, but not when it would fit a long list', () => {
    const croissants = [{ id: 'b', name: 'Butter Croissant' }, { id: 'c', name: 'Chocolate Croissant' }];
    expect(ask(resolveMenuItem('croissant', croissants))).toEqual(['b', 'c']);
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, name: `Flavour ${i} Cake` }));
    expect(resolveMenuItem('cake', many)).toEqual({ kind: 'keep' });
  });
});
