/**
 * mergeMaterials.ts
 *
 * Merging two inventory items that are one thing ("Chini" into "Sugar"): what the kept item becomes, and every record
 * that pointed at the other one, moved across, before the other is deleted. Planned here without Firebase, so it can be
 * tested and shown to the owner first (`mergeSummary`); useMergeMaterials writes it.
 *
 * The kept item takes:
 *  - both stocks, the other's converted to the kept item's unit (500 g joins 2 kg as 2.5 kg), and both stock batches;
 *  - a cost averaged by how much of each there is (both stocks at their own cost), or, with no stock to weigh, its own
 *    cost unless it had none;
 *  - its own name, category, unit and threshold; the other's threshold, nutrition, allergens, GST rate, spoon and piece
 *    weights only where it has none; the sooner of the two expiry dates (merged stock is only as fresh as its oldest).
 * And these move across, in the kept item's unit where the record is in the item's own unit:
 *  - recipe lines (a recipe that has both gets one line, the amounts added, when their units convert; else both lines
 *    stay, each now the kept item);
 *  - test-bake lines, the same way;
 *  - what orders took (so deleting one gives it back to the kept item);
 *  - wastage records;
 *  - the price history (each entry keeps its own unit).
 * Only items counted the same way can be merged: by weight (g, kg), by volume (ml, l), or in the same unit.
 */
import type { IngredientRequirement, MenuItem, Order, PriceLogEntry, RawMaterial, RecipeExperiment, WastageLog } from '../types';
import { UNIT_CONVERSIONS, convertAmount, enterableUnits } from './conversions';

export interface MergeInput {
  keep: RawMaterial;
  remove: RawMaterial;
  menu: MenuItem[];
  experiments: RecipeExperiment[];
  orders: Order[];
  wastageLogs: WastageLog[];
  priceLog: PriceLogEntry[];
}

export type MergeCollection = 'materials' | 'menu' | 'experiments' | 'orders' | 'wastageLogs' | 'priceLog';

/** One document to change: `merge` writes only `data`'s fields. */
export interface MergeWrite { collection: MergeCollection; id: string; data: Record<string, unknown>; merge: boolean }

export interface MergePlan {
  /** Every record that moves across: written first. */
  moves: MergeWrite[];
  /** The kept item as it becomes: written last, with the delete, so stock is never counted twice or lost. */
  keep: MergeWrite;
  /** The merged item, deleted last. */
  removeId: string;
  /** The kept item after the merge, for the summary. */
  merged: RawMaterial;
  counts: { recipes: number; experiments: number; orders: number; wastage: number; prices: number };
}

const norm = (u: string | undefined) => (u || 'g').trim().toLowerCase();
const round = (n: number, places = 6) => Math.round(n * 10 ** places) / 10 ** places;

/** Whether two items are counted the same way, so one's amounts can become the other's. */
export function canMerge(a: Pick<RawMaterial, 'unit'>, b: Pick<RawMaterial, 'unit'>): boolean {
  return norm(a.unit) === norm(b.unit) || enterableUnits(norm(a.unit)).includes(norm(b.unit));
}

/** Whether an amount in one unit can be put in another (g and kg, ml and l, tsp and g when known...). */
const converts = (from: string, to: string) => norm(from) === norm(to) || UNIT_CONVERSIONS[norm(from)]?.[norm(to)] !== undefined;

/**
 * A list of ingredient lines with the merged item's lines now the kept item's, one line where both were and their units
 * convert. Null when nothing in it changes.
 */
function repointLines(lines: IngredientRequirement[], keepId: string, removeId: string): IngredientRequirement[] | null {
  if (!lines.some(l => l.materialId === removeId)) return null;
  const out: IngredientRequirement[] = [];
  for (const line of lines) {
    if (line.materialId !== removeId) { out.push({ ...line }); continue; }
    const kept = out.find(l => l.materialId === keepId && converts(line.unit, l.unit));
    if (kept) kept.amount = round(kept.amount + convertAmount(line.amount, line.unit, kept.unit));
    else out.push({ ...line, materialId: keepId });
  }
  // A kept line that comes after the merged one: join them the other way round.
  const joined: IngredientRequirement[] = [];
  for (const line of out) {
    const earlier = line.materialId === keepId ? joined.find(l => l.materialId === keepId && converts(line.unit, l.unit)) : undefined;
    if (earlier) earlier.amount = round(earlier.amount + convertAmount(line.amount, line.unit, earlier.unit));
    else joined.push(line);
  }
  return joined;
}

export function planMergeMaterials(input: MergeInput): MergePlan | { error: string } {
  const { keep, remove } = input;
  if (keep.id === remove.id) return { error: 'Choose two different items to merge.' };
  if (!canMerge(keep, remove)) {
    return { error: `${keep.name.trim()} is counted in ${keep.unit || 'g'} and ${remove.name.trim()} in ${remove.unit || 'g'}, so one cannot become the other. Only items counted the same way can be merged.` };
  }
  const own = keep.unit || 'g';
  const theirs = remove.unit || 'g';
  const toOwn = (amount: number) => convertAmount(amount, theirs, own);
  const moves: MergeWrite[] = [];

  let recipes = 0;
  for (const item of input.menu) {
    const recipe = repointLines(item.recipe ?? [], keep.id, remove.id);
    if (recipe) { recipes++; moves.push({ collection: 'menu', id: item.id, data: { recipe }, merge: true }); }
  }
  let experiments = 0;
  for (const exp of input.experiments) {
    const materials = repointLines(exp.materials ?? [], keep.id, remove.id);
    if (materials) { experiments++; moves.push({ collection: 'experiments', id: exp.id, data: { materials }, merge: true }); }
  }
  let orders = 0;
  for (const order of input.orders) {
    const took = order.taken?.materials;
    if (!order.taken || !took?.some(m => m.materialId === remove.id)) continue;
    const materials: { materialId: string; amount: number }[] = [];
    for (const m of took) {
      const amount = m.materialId === remove.id ? toOwn(m.amount) : m.amount;
      const id = m.materialId === remove.id ? keep.id : m.materialId;
      const same = materials.find(x => x.materialId === id);
      if (same) same.amount = round(same.amount + amount);
      else materials.push({ materialId: id, amount: round(amount) });
    }
    orders++;
    moves.push({ collection: 'orders', id: order.id, data: { taken: { ...order.taken, materials } }, merge: true });
  }
  let wastage = 0;
  for (const log of input.wastageLogs) {
    if (log.type !== 'material' || log.itemId !== remove.id) continue;
    wastage++;
    moves.push({ collection: 'wastageLogs', id: log.id, data: { itemId: keep.id, quantity: round(toOwn(log.quantity)) }, merge: true });
  }
  let prices = 0;
  for (const entry of input.priceLog) {
    if (entry.materialId !== remove.id) continue;
    prices++;
    moves.push({ collection: 'priceLog', id: entry.id, data: { materialId: keep.id }, merge: true });
  }

  // The kept item: both stocks, a cost averaged by them, and what it lacked from the other.
  const theirStock = toOwn(remove.initialStock || 0);
  const theirCost = (remove.costPerUnit || 0) / convertAmount(1, theirs, own);
  const weightOwn = Math.max(0, keep.initialStock || 0);
  const weightTheirs = Math.max(0, theirStock);
  const cost = weightOwn + weightTheirs > 0
    ? (weightOwn * (keep.costPerUnit || 0) + weightTheirs * theirCost) / (weightOwn + weightTheirs)
    : (keep.costPerUnit || theirCost);
  const batches = [
    ...(keep.batches ?? []),
    ...(remove.batches ?? []).map(b => ({
      ...b,
      originalQuantity: round(toOwn(b.originalQuantity)),
      remainingQuantity: round(toOwn(b.remainingQuantity)),
      costPerUnit: round(b.costPerUnit / convertAmount(1, theirs, own)),
    })),
  ];
  const expiry = [keep.expiryDate, remove.expiryDate].filter((d): d is string => !!d).sort()[0];
  const fill: Partial<RawMaterial> = {};
  if (!keep.threshold && remove.threshold) fill.threshold = round(toOwn(remove.threshold));
  if (!keep.nutrition && remove.nutrition) { fill.nutrition = remove.nutrition; if (remove.nutritionSource) fill.nutritionSource = remove.nutritionSource; }
  if (!keep.allergens?.length && remove.allergens?.length) fill.allergens = remove.allergens;
  if (keep.gstRate == null && remove.gstRate != null) fill.gstRate = remove.gstRate;
  if (keep.gramsPerTsp == null && remove.gramsPerTsp != null) fill.gramsPerTsp = remove.gramsPerTsp;
  if (keep.gramsPerPiece == null && remove.gramsPerPiece != null) fill.gramsPerPiece = remove.gramsPerPiece;
  if (keep.leadTimeDays == null && remove.leadTimeDays != null) fill.leadTimeDays = remove.leadTimeDays;
  if (keep.dateAdded && remove.dateAdded && remove.dateAdded < keep.dateAdded) fill.dateAdded = remove.dateAdded;

  const data: Partial<RawMaterial> = {
    initialStock: round((keep.initialStock || 0) + theirStock, 4),
    costPerUnit: round(cost),
    ...(batches.length > 0 && { batches }),
    ...(expiry && { expiryDate: expiry }),
    ...fill,
  };
  return {
    moves,
    keep: { collection: 'materials', id: keep.id, data, merge: true },
    removeId: remove.id,
    merged: { ...keep, ...data },
    counts: { recipes, experiments, orders, wastage, prices },
  };
}

/** What the merge screen says will happen, as short lines. */
export function mergeSummary(input: MergeInput, plan: MergePlan, fmt: { amount: (n: number, unit: string) => string; money: (n: number) => string }): string[] {
  const { keep, remove } = input;
  const own = keep.unit || 'g';
  // The stock the inventory shows (after what test bakes are still drawing), when the items carry it.
  const shown = (m: RawMaterial) => (m as RawMaterial & { remaining?: number }).remaining ?? m.initialStock ?? 0;
  const total = Math.round((shown(keep) + convertAmount(shown(remove), remove.unit || 'g', own)) * 1e4) / 1e4;
  const lines = [
    `Stock: ${fmt.amount(shown(keep), own)} + ${fmt.amount(shown(remove), remove.unit || 'g')} = ${fmt.amount(total, own)}.`,
    `Cost: ${fmt.money(plan.merged.costPerUnit)} per ${own}${Math.abs(plan.merged.costPerUnit - (keep.costPerUnit || 0)) > 1e-9 ? `, averaged from both (was ${fmt.money(keep.costPerUnit || 0)})` : ''}.`,
  ];
  const c = plan.counts;
  const moved = [
    c.recipes && `${c.recipes} ${c.recipes === 1 ? 'recipe' : 'recipes'}`,
    c.experiments && `${c.experiments} test ${c.experiments === 1 ? 'bake' : 'bakes'}`,
    c.orders && `${c.orders} ${c.orders === 1 ? 'order' : 'orders'}`,
    c.wastage && `${c.wastage} wastage ${c.wastage === 1 ? 'record' : 'records'}`,
    c.prices && `${c.prices} ${c.prices === 1 ? 'price' : 'prices'} in its history`,
  ].filter(Boolean) as string[];
  if (moved.length > 0) lines.push(`Moves to ${keep.name.trim()}: ${moved.join(', ')}.`);
  lines.push(`${remove.name.trim()} is then deleted. This cannot be undone.`);
  return lines;
}
