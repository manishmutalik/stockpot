import { describe, expect, it } from 'vitest';
import { experimentDeleteWarning, materialDeleteWarning, menuItemDeleteWarning, mergeWarning, nameList, ordersDeleteWarning } from '../deleteWarnings';
import type { MenuItem, Order, RecipeExperiment } from '../../types';

describe('nameList', () => {
  it('joins names the way a person would, and counts the rest past three', () => {
    expect(nameList([])).toBe('');
    expect(nameList(['A'])).toBe('A');
    expect(nameList(['A', 'B'])).toBe('A and B');
    expect(nameList(['A', 'B', 'C'])).toBe('A, B and C');
    expect(nameList(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C and 2 more');
  });
});

describe('what the popup says before a delete', () => {
  it('names the inventory item and the recipes it will be taken out of', () => {
    expect(materialDeleteWarning('Unsalted Butter', ['Croissant', 'Pain au Chocolat'])).toEqual({
      title: 'Delete Unsalted Butter?',
      message: 'It is in 2 recipes: Croissant and Pain au Chocolat. It will be taken out of them, so their costs will no longer count it. This cannot be undone.',
      confirmLabel: 'Delete',
    });
    expect(materialDeleteWarning('Butter', ['Croissant']).message).toMatch(/^It is in 1 recipe: Croissant\. It will be taken out of it, so its cost/);
    expect(materialDeleteWarning('  ', []).title).toBe('Delete this item?');
    expect(materialDeleteWarning('Saffron', []).message).toBe('Its stock and price go with it. This cannot be undone.');
  });

  it('says a menu item takes its orders with it, and off the sales', () => {
    expect(menuItemDeleteWarning('Butter Croissant', 14).message).toBe('Its recipe goes, and so do its 14 orders: those sales come off your sales and reports. This cannot be undone.');
    expect(menuItemDeleteWarning('Butter Croissant', 1).message).toMatch(/so does its 1 order: that sale comes off/);
    expect(menuItemDeleteWarning('Butter Croissant', 0).message).toBe('Its recipe goes with it. This cannot be undone.');
  });

  it('describes the order: how many of what, and for whom', () => {
    const menu = [
      { id: 'c', name: 'Croissant', sellingPrice: 80, recipe: [] },
      { id: 'g', name: 'Ganache', sellingPrice: 900, recipe: [], countedIn: 'kg' },
    ] as unknown as MenuItem[];
    const one: Order = { id: '1', menuItemId: 'c', quantity: 12, date: '2026-11-15', customerName: 'Anita' };
    expect(ordersDeleteWarning([one], menu)).toEqual({
      title: 'Delete this order?',
      message: '12 × Croissant for Anita. Any stock it took goes back, and it comes off your sales. This cannot be undone.',
      confirmLabel: 'Delete',
    });
    const two: Order[] = [one, { id: '2', menuItemId: 'g', quantity: 1.5, date: '2026-11-15' }];
    const w = ordersDeleteWarning(two, menu);
    expect(w.title).toBe('Delete this whole order?');
    expect(w.message).toMatch(/^All 2 items for Anita: 12 × Croissant and .*Ganache\. Any stock they took goes back/);
  });

  it('says a test bake gives back the bases it used', () => {
    const exp = { id: 'e', name: 'Eggless sponge', date: '2026-11-15', materials: [] } as RecipeExperiment;
    expect(experimentDeleteWarning(exp)).toEqual({ title: 'Delete "Eggless sponge"?', message: 'The session and its notes go. This cannot be undone.', confirmLabel: 'Delete' });
    expect(experimentDeleteWarning({ ...exp, parts: [{ itemId: 'b', quantity: 1 }] }).message).toMatch(/go back to stock/);
    expect(experimentDeleteWarning(undefined).title).toBe('Delete this session?');
  });

  it('asks before a merge, naming both items, with a Merge button', () => {
    expect(mergeWarning('Sugar', ' Chini ')).toEqual({
      title: 'Merge Chini into Sugar?',
      message: 'Its stock, recipes and history move to Sugar, and Chini is deleted. This cannot be undone.',
      confirmLabel: 'Merge',
    });
  });
});
