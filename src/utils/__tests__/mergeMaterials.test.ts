import { describe, expect, it } from 'vitest';
import { canMerge, mergeSummary, planMergeMaterials, type MergeInput, type MergePlan } from '../mergeMaterials';
import type { MenuItem, Order, PriceLogEntry, RawMaterial, RecipeExperiment, WastageLog } from '../../types';

const mat = (id: string, name: string, over: Partial<RawMaterial> = {}): RawMaterial =>
  ({ id, name, unit: 'g', initialStock: 0, costPerUnit: 0, category: 'Raw Materials', threshold: 0, dateAdded: '2026-03-01', ...over });

const sugar = mat('sugar', 'Sugar', { unit: 'kg', initialStock: 2, costPerUnit: 40, threshold: 1 });
const chini = mat('chini', 'Chini', { unit: 'g', initialStock: 500, costPerUnit: 0.05, threshold: 200, dateAdded: '2026-01-10', gramsPerTsp: 4.2 });

const input = (over: Partial<MergeInput> = {}): MergeInput => ({ keep: sugar, remove: chini, menu: [], experiments: [], orders: [], wastageLogs: [], priceLog: [], ...over });
const plan = (over: Partial<MergeInput> = {}) => planMergeMaterials(input(over)) as MergePlan;

describe('canMerge', () => {
  it('lets items counted the same way merge, and no others', () => {
    expect(canMerge({ unit: 'kg' }, { unit: 'g' })).toBe(true);
    expect(canMerge({ unit: 'l' }, { unit: 'ML' })).toBe(true);
    expect(canMerge({ unit: 'pcs' }, { unit: 'pcs' })).toBe(true);
    expect(canMerge({ unit: 'g' }, { unit: 'pcs' })).toBe(false);
    expect(canMerge({ unit: 'g' }, { unit: 'ml' })).toBe(false);
  });
});

describe('planMergeMaterials', () => {
  it('refuses items counted differently, or one item with itself', () => {
    expect(planMergeMaterials(input({ remove: mat('eggs', 'Eggs', { unit: 'pcs' }) }))).toEqual({ error: expect.stringMatching(/Sugar is counted in kg and Eggs in pcs/) });
    expect(planMergeMaterials(input({ remove: sugar }))).toEqual({ error: 'Choose two different items to merge.' });
  });

  it('adds both stocks in the kept unit, averages the cost by them, and fills what the kept item lacked', () => {
    const p = plan();
    // 2 kg at ₹40/kg + 0.5 kg at ₹50/kg = 2.5 kg at ₹42/kg.
    expect(p.keep).toEqual({ collection: 'materials', id: 'sugar', merge: true, data: { initialStock: 2.5, costPerUnit: 42, gramsPerTsp: 4.2, dateAdded: '2026-01-10' } });
    expect(p.removeId).toBe('chini');
  });

  it('keeps its own threshold, and takes the other’s, converted, only when it had none', () => {
    expect(plan().keep.data.threshold).toBeUndefined();
    expect(plan({ keep: { ...sugar, threshold: 0 } }).keep.data.threshold).toBe(0.2);
  });

  it('with no stock to weigh, keeps its own cost, or takes the other’s if it had none', () => {
    expect(plan({ keep: { ...sugar, initialStock: 0 }, remove: { ...chini, initialStock: 0 } }).keep.data.costPerUnit).toBe(40);
    expect(plan({ keep: { ...sugar, initialStock: 0, costPerUnit: 0 }, remove: { ...chini, initialStock: 0 } }).keep.data.costPerUnit).toBe(50);
  });

  it('takes the sooner expiry and both stock batches, converted', () => {
    const p = plan({
      keep: { ...sugar, expiryDate: '2027-01-01', batches: [{ id: 'k', originalQuantity: 2, remainingQuantity: 2, expiryDate: '2027-01-01', costPerUnit: 40, dateAdded: '2026-03-01' }] },
      remove: { ...chini, expiryDate: '2026-12-01', batches: [{ id: 'r', originalQuantity: 500, remainingQuantity: 300, expiryDate: '2026-12-01', costPerUnit: 0.05, dateAdded: '2026-01-10' }] },
    });
    expect(p.keep.data.expiryDate).toBe('2026-12-01');
    expect(p.keep.data.batches).toEqual([
      expect.objectContaining({ id: 'k', remainingQuantity: 2 }),
      expect.objectContaining({ id: 'r', originalQuantity: 0.5, remainingQuantity: 0.3, costPerUnit: 50 }),
    ]);
  });

  it('moves recipe lines across, joining them where a recipe had both', () => {
    const menu = [
      { id: 'cake', name: 'Cake', sellingPrice: 500, recipe: [{ materialId: 'sugar', amount: 100, unit: 'g' }, { materialId: 'flour', amount: 200, unit: 'g' }, { materialId: 'chini', amount: 50, unit: 'g' }] },
      { id: 'ladoo', name: 'Ladoo', sellingPrice: 20, recipe: [{ materialId: 'chini', amount: 0.02, unit: 'kg' }] },
      { id: 'bread', name: 'Bread', sellingPrice: 60, recipe: [{ materialId: 'flour', amount: 300, unit: 'g' }] },
    ] as MenuItem[];
    const p = plan({ menu });
    expect(p.moves).toEqual([
      { collection: 'menu', id: 'cake', merge: true, data: { recipe: [{ materialId: 'sugar', amount: 150, unit: 'g' }, { materialId: 'flour', amount: 200, unit: 'g' }] } },
      { collection: 'menu', id: 'ladoo', merge: true, data: { recipe: [{ materialId: 'sugar', amount: 0.02, unit: 'kg' }] } },
    ]);
    expect(p.counts.recipes).toBe(2);
  });

  it('joins a kept line that comes after the merged one too', () => {
    const menu = [{ id: 'cake', name: 'Cake', sellingPrice: 1, recipe: [{ materialId: 'chini', amount: 50, unit: 'g' }, { materialId: 'sugar', amount: 0.1, unit: 'kg' }] }] as MenuItem[];
    expect(plan({ menu }).moves[0].data.recipe).toEqual([{ materialId: 'sugar', amount: 150, unit: 'g' }]);
  });

  it('moves test bakes, what orders took, wastage and the price history, in the kept unit', () => {
    const experiments = [{ id: 'e', name: 'Trial', date: '2026-10-01', materials: [{ materialId: 'chini', amount: 30, unit: 'g' }] }] as RecipeExperiment[];
    const orders = [
      { id: 'o', menuItemId: 'cake', quantity: 1, date: '2026-10-01', taken: { materials: [{ materialId: 'chini', amount: 250 }, { materialId: 'sugar', amount: 0.25 }], parts: [], cost: 20 } },
      { id: 'p', menuItemId: 'cake', quantity: 1, date: '2026-10-01' },
    ] as Order[];
    const wastageLogs = [{ id: 'w', type: 'material', itemId: 'chini', quantity: 100, cost: 5, date: '2026-10-01', reason: 'Spilt' }, { id: 'x', type: 'recipe', itemId: 'chini', quantity: 1, cost: 1, date: '2026-10-01', reason: '' }] as WastageLog[];
    const priceLog = [{ id: 'pl', materialId: 'chini', unit: 'g', unitCost: 0.05, source: 'restock', date: '2026-09-01', createdAt: 1 }] as PriceLogEntry[];
    const p = plan({ experiments, orders, wastageLogs, priceLog });
    expect(p.moves).toEqual([
      { collection: 'experiments', id: 'e', merge: true, data: { materials: [{ materialId: 'sugar', amount: 30, unit: 'g' }] } },
      { collection: 'orders', id: 'o', merge: true, data: { taken: { materials: [{ materialId: 'sugar', amount: 0.5 }], parts: [], cost: 20 } } },
      { collection: 'wastageLogs', id: 'w', merge: true, data: { itemId: 'sugar', quantity: 0.1 } },
      { collection: 'priceLog', id: 'pl', merge: true, data: { materialId: 'sugar' } },
    ]);
    expect(p.counts).toEqual({ recipes: 0, experiments: 1, orders: 1, wastage: 1, prices: 1 });
  });
});

describe('mergeSummary', () => {
  it('says what the kept item becomes, what moves, and that the other is deleted', () => {
    const menu = [{ id: 'cake', name: 'Cake', sellingPrice: 1, recipe: [{ materialId: 'chini', amount: 50, unit: 'g' }] }] as MenuItem[];
    const priceLog = [{ id: 'a', materialId: 'chini' }, { id: 'b', materialId: 'chini' }] as PriceLogEntry[];
    const i = input({ menu, priceLog });
    const lines = mergeSummary(i, planMergeMaterials(i) as MergePlan, { amount: (n, u) => `${n} ${u}`, money: n => `₹${n.toFixed(2)}` });
    expect(lines).toEqual([
      'Stock: 2 kg + 500 g = 2.5 kg.',
      'Cost: ₹42.00 per kg, averaged from both (was ₹40.00).',
      'Moves to Sugar: 1 recipe, 2 prices in its history.',
      'Chini is then deleted. This cannot be undone.',
    ]);
  });
});
