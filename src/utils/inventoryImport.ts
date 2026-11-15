/**
 * inventoryImport.ts
 *
 * What a CSV of inventory items (Name, Unit, Initial Stock, Cost, Threshold) does, worked out before anything is written,
 * so importing the same file twice never doubles the inventory:
 *  - a row whose item is already there (the same name, ignoring case, spacing, punctuation, plurals and pack sizes:
 *    utils/duplicates' nameKey) updates that item's cost and reorder level from the cells that are filled in. Its stock is
 *    left as it is: what is left is worked out from the stock and what has been used since, so a file cannot set it, and
 *    adding to it is Restock's job. A cost given per kg for an item kept in grams (or l and ml) is converted; a unit of
 *    another kind (pcs for an item kept in grams) skips the row, with the reason;
 *  - any other row adds a new item, as before;
 *  - a name that appears twice in the file is one item, from its last row;
 *  - a row that matches two items already (themselves duplicates) is skipped: which to update is the owner's call.
 */
import type { RawMaterial } from '../types';
import { convertAmount, enterableUnits } from './conversions';
import { isPlaceholderName, nameKey } from './duplicates';
import { nameList } from './deleteWarnings';

export interface CsvUpdate {
  id: string;
  name: string;
  /** Only what the file changes. */
  fields: Partial<Pick<RawMaterial, 'costPerUnit' | 'threshold'>>;
  /** The item's own unit, which the fields are in. */
  unit: string;
}

export interface CsvImportPlan {
  create: RawMaterial[];
  update: CsvUpdate[];
  /** Items already there that the file changes nothing about. */
  unchanged: string[];
  skipped: { name: string; reason: string }[];
  /** Names that appeared on more than one row (the last row was used). */
  repeated: string[];
}

type Row = Record<string, unknown>;

/** A cell by its column name, ignoring case and spacing ("initial stock" is "Initial Stock"). */
function cell(row: Row, column: string): string {
  const want = column.toLowerCase().replace(/\s+/g, '');
  const key = Object.keys(row).find(k => k.toLowerCase().replace(/\s+/g, '') === want);
  const v = key === undefined ? undefined : row[key];
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
}

/** A number written in a cell, or undefined for a blank or unreadable one (which then changes nothing). */
function numberIn(row: Row, column: string): number | undefined {
  const text = cell(row, column).replace(/[,\s₹$]/g, '');
  if (!text) return undefined;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function planCsvImport(rows: Row[], materials: RawMaterial[], input: { category: string; today: string; newId: () => string }): CsvImportPlan {
  const plan: CsvImportPlan = { create: [], update: [], unchanged: [], skipped: [], repeated: [] };

  // One row per item: the last row for a name wins, in the order the names first appear.
  const byKey = new Map<string, Row>();
  const seen = new Set<string>();
  for (const row of rows) {
    const name = cell(row, 'Name');
    if (!name) continue;
    const key = isPlaceholderName(name) ? `\u0000${name}` : nameKey(name);
    if (seen.has(key) && !plan.repeated.includes(name)) plan.repeated.push(name);
    seen.add(key);
    byKey.delete(key);
    byKey.set(key, row);
  }

  for (const [key, row] of byKey) {
    const name = cell(row, 'Name');
    const unitCell = cell(row, 'Unit');
    const stock = numberIn(row, 'Initial Stock');
    const cost = numberIn(row, 'Cost');
    const threshold = numberIn(row, 'Threshold');
    const existing = materials.filter(m => !isPlaceholderName(m.name) && nameKey(m.name) === key);

    if (existing.length > 1) {
      plan.skipped.push({ name, reason: `${name} matches ${existing.length} items you already have (${nameList(existing.map(m => m.name.trim()))}), so it was not clear which to update` });
      continue;
    }

    if (existing.length === 0) {
      plan.create.push({
        id: input.newId(),
        name,
        unit: unitCell || 'g',
        initialStock: stock ?? 0,
        costPerUnit: cost ?? 0,
        category: input.category,
        threshold: threshold ?? 0,
        dateAdded: input.today,
      });
      continue;
    }

    const mat = existing[0];
    const own = mat.unit || 'g';
    const rowUnit = unitCell || own;
    if (rowUnit.toLowerCase() !== own.toLowerCase() && !enterableUnits(own).includes(rowUnit.toLowerCase())) {
      plan.skipped.push({ name, reason: `${mat.name} is counted in ${own} in your inventory, not ${rowUnit}` });
      continue;
    }
    // A cost per kg becomes a cost per g by dividing by the grams in a kg; a reorder level converts as an amount.
    const perOwn = convertAmount(1, rowUnit, own);
    const fields: CsvUpdate['fields'] = {};
    if (cost !== undefined && round6(cost / perOwn) !== round6(mat.costPerUnit || 0)) fields.costPerUnit = round6(cost / perOwn);
    if (threshold !== undefined && round6(convertAmount(threshold, rowUnit, own)) !== round6(mat.threshold || 0)) fields.threshold = round6(convertAmount(threshold, rowUnit, own));
    if (Object.keys(fields).length > 0) plan.update.push({ id: mat.id, name: mat.name, fields, unit: own });
    else plan.unchanged.push(mat.name);
  }
  return plan;
}

/** What the owner is told after the import. */
export function csvImportSummary(plan: CsvImportPlan): { title: string; message: string } {
  const parts: string[] = [];
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  if (plan.create.length > 0) parts.push(`Added ${n(plan.create.length, 'new item', 'new items')}.`);
  const had = plan.update.length + plan.unchanged.length;
  if (plan.update.length > 0) {
    parts.push(`Updated ${n(plan.update.length, 'item', 'items')} you already had (${nameList(plan.update.map(u => u.name))}) with the cost and reorder level in the file.`);
  }
  if (plan.unchanged.length > 0) {
    parts.push(`${n(plan.unchanged.length, 'item was', 'items were')} already there as in the file (${nameList(plan.unchanged)}).`);
  }
  if (had > 0) parts.push(`Stock of items you already had is left as it is: use Restock to add to it.`);
  if (plan.repeated.length > 0) parts.push(`${nameList(plan.repeated)} ${plan.repeated.length === 1 ? 'was' : 'were'} in the file more than once: the last row was used.`);
  if (plan.skipped.length > 0) {
    parts.push(`Skipped ${n(plan.skipped.length, 'row', 'rows')}: ${plan.skipped.map(s => s.reason).join('; ')}.`);
  }
  const nothing = plan.create.length + had === 0;
  return {
    title: nothing ? (plan.skipped.length > 0 ? 'Nothing imported' : 'No items found') : 'Import done',
    message: nothing && plan.skipped.length === 0 ? 'No items found in the CSV. Make sure it has a "Name" column.' : parts.join(' '),
  };
}
