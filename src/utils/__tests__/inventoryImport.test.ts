import { describe, expect, it } from 'vitest';
import { csvImportSummary, planCsvImport } from '../inventoryImport';
import type { RawMaterial } from '../../types';

const mat = (id: string, name: string, over: Partial<RawMaterial> = {}): RawMaterial =>
  ({ id, name, unit: 'g', initialStock: 1000, costPerUnit: 0.5, category: 'Raw Materials', threshold: 200, dateAdded: '2026-01-01', ...over });

const ids = () => { let i = 0; return () => `new${++i}`; };
const plan = (rows: Record<string, string>[], materials: RawMaterial[]) =>
  planCsvImport(rows, materials, { category: 'Dairy', today: '2026-11-15', newId: ids() });

describe('planCsvImport', () => {
  it('adds an item the inventory does not have, as before', () => {
    const p = plan([{ Name: 'Saffron', Unit: 'g', 'Initial Stock': '5', Cost: '450', Threshold: '1' }], []);
    expect(p.create).toEqual([{ id: 'new1', name: 'Saffron', unit: 'g', initialStock: 5, costPerUnit: 450, category: 'Dairy', threshold: 1, dateAdded: '2026-11-15' }]);
    expect(p.update).toEqual([]);
  });

  it('updates an item it already has, however its name is written, and leaves its stock alone', () => {
    const p = plan([{ Name: 'eggs', Unit: 'g', 'Initial Stock': '9999', Cost: '0.8', Threshold: '300' }], [mat('egg', 'Egg')]);
    expect(p.create).toEqual([]);
    expect(p.update).toEqual([{ id: 'egg', name: 'Egg', fields: { costPerUnit: 0.8, threshold: 300 }, unit: 'g' }]);
  });

  it('importing the same file twice adds nothing the second time', () => {
    const rows = [{ Name: 'Flour', Unit: 'kg', 'Initial Stock': '100', Cost: '2.5', Threshold: '20' }];
    const first = plan(rows, []);
    expect(first.create).toHaveLength(1);
    const second = plan(rows, first.create);
    expect(second.create).toEqual([]);
    expect(second.update).toEqual([]);
    expect(second.unchanged).toEqual(['Flour']);
  });

  it('changes only what the file fills in', () => {
    const p = plan([{ Name: 'Butter', Cost: '0.6' }], [mat('b', 'Butter')]);
    expect(p.update).toEqual([{ id: 'b', name: 'Butter', fields: { costPerUnit: 0.6 }, unit: 'g' }]);
  });

  it('converts a cost per kg to the item’s grams, and a reorder level with it', () => {
    const p = plan([{ Name: 'Butter', Unit: 'kg', Cost: '600', Threshold: '2' }], [mat('b', 'Butter')]);
    expect(p.update[0].fields).toEqual({ costPerUnit: 0.6, threshold: 2000 });
  });

  it('skips a row whose unit is of another kind, saying why', () => {
    const p = plan([{ Name: 'Butter', Unit: 'pcs', Cost: '50' }], [mat('b', 'Butter')]);
    expect(p.update).toEqual([]);
    expect(p.skipped).toEqual([{ name: 'Butter', reason: 'Butter is counted in g in your inventory, not pcs' }]);
  });

  it('skips a row that matches two items already, rather than guess', () => {
    const p = plan([{ Name: 'Sugar', Cost: '0.05' }], [mat('a', 'Sugar'), mat('b', 'sugar ')]);
    expect(p.skipped[0].reason).toMatch(/matches 2 items you already have \(Sugar and sugar\)/);
  });

  it('makes one item of a name that appears twice, from its last row', () => {
    const p = plan([{ Name: 'Cocoa', Cost: '1' }, { Name: 'Saffron', Cost: '450' }, { Name: 'cocoa', Cost: '2' }], []);
    expect(p.create.map(c => [c.name, c.costPerUnit])).toEqual([['Saffron', 450], ['cocoa', 2]]);
    expect(p.repeated).toEqual(['cocoa']);
  });

  it('does not treat a synonym as the same row to update: "Chini" is added, and flagged as a duplicate in the inventory', () => {
    expect(plan([{ Name: 'Chini', Cost: '0.05' }], [mat('s', 'Sugar')]).create).toHaveLength(1);
  });

  it('ignores rows with no name, and blank or unreadable numbers', () => {
    const p = plan([{ Name: '' }, { Name: 'Milk', Unit: 'ml', Cost: 'abc', Threshold: '-4' }], []);
    expect(p.create).toEqual([expect.objectContaining({ name: 'Milk', unit: 'ml', costPerUnit: 0, threshold: 0 })]);
  });

  it('reads column names in any case', () => {
    const p = plan([{ name: 'Butter', cost: '0.7', 'initial stock': '5' }], [mat('b', 'Butter')]);
    expect(p.update[0].fields).toEqual({ costPerUnit: 0.7 });
  });
});

describe('csvImportSummary', () => {
  it('says what was added, updated, left, repeated and skipped', () => {
    const p = plan(
      [
        { Name: 'Saffron', Cost: '450' },
        { Name: 'Butter', Cost: '0.6' },
        { Name: 'Flour', Cost: '0.5' },
        { Name: 'Milk', Unit: 'pcs' },
        { Name: 'saffron', Cost: '460' },
      ],
      [mat('b', 'Butter'), mat('f', 'Flour'), mat('m', 'Milk', { unit: 'ml' })],
    );
    const s = csvImportSummary(p);
    expect(s.title).toBe('Import done');
    expect(s.message).toBe(
      'Added 1 new item. Updated 1 item you already had (Butter) with the cost and reorder level in the file. ' +
      '1 item was already there as in the file (Flour). Stock of items you already had is left as it is: use Restock to add to it. ' +
      'saffron was in the file more than once: the last row was used. Skipped 1 row: Milk is counted in ml in your inventory, not pcs.',
    );
  });

  it('says plainly when there was nothing to import', () => {
    expect(csvImportSummary(plan([{ Unit: 'g' }], []))).toEqual({ title: 'No items found', message: 'No items found in the CSV. Make sure it has a "Name" column.' });
  });
});
