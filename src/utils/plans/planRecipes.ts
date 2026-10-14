/**
 * planRecipes.ts
 *
 * What saving recipes from the recipe reader writes, worked out without touching Firebase, so the web (a client
 * batch) and the phone's server endpoint (an Admin SDK transaction) write the same documents, all or nothing.
 *
 * The check screen has already settled every line (utils/kitchenMeasures): each is an amount per item sold, of an
 * existing material or of one created here. A recipe that is part of another (whipped cream on a cake) arrives
 * already folded into that item's lines. This plan:
 *  - creates the new materials: no stock, and the price per unit when the owner gave one (with an opening entry in
 *    its price history), otherwise none: such an item shows "cost incomplete" until a price is added;
 *  - remembers on existing materials the spoon or piece weights the owner confirmed, so they are not asked again;
 *  - creates menu items, or replaces or adds to an existing item's recipe. A new item with a selling price is stamped
 *    as priced today, as setting a price in the Menu tab does. A recipe that makes several keeps that as the item's
 *    batch size (utils/batches), unless it only adds to an item's recipe.
 *  - an item made ahead and kept (a sponge base) is created first, not sold on the menu, and linked as a part of the
 *    items that use it (utils/itemParts): parts already on an item are kept, the same part's quantity replaced. An item
 *    can never end up inside itself. A sold item can be made when ordered (utils/madeToOrder).
 * Matched materials are otherwise never changed: their stock and price stay as they are.
 */
import type { IngredientRequirement, ItemPart, MenuItem, RawMaterial } from '../../types';
import { pricingStamp } from '../pricing';
import { costView, wouldLoop } from '../itemParts';
import { newPriceLogEntry } from '../priceLog';
import type { PlanContext, PlannedWrite } from './types';

export type RecipeLineMaterial = { existingId: string } | { newKey: string };

export interface RecipeImportLine {
  material: RecipeLineMaterial;
  /** For one item sold, in `unit`. */
  amount: number;
  /** The recipe unit: g, ml, pcs or the material's own. */
  unit: string;
}

export type RecipeImportTarget =
  | { kind: 'new'; name: string; sellingPrice?: number; emoji?: string }
  | { kind: 'existing'; menuItemId: string; mode: 'replace' | 'add' };

/** Another item that goes into one of this: one saved in the same import (by its `key`), or one already on the menu. */
export interface RecipeImportPart { item: { existingId: string } | { newKey: string }; quantity: number }

export interface RecipeImportItem {
  /** How the other items of the same import refer to it (a base made ahead, used in a cake saved with it). */
  key?: string;
  target: RecipeImportTarget;
  lines: RecipeImportLine[];
  /** How many one batch of the recipe makes. Kept on a new item, or one whose recipe it replaces, when more than one. */
  batchMakes?: number;
  /** Made only to go into other items (a base made ahead and kept). New items only. */
  notForSale?: boolean;
  /** Made when it is ordered. */
  madeToOrder?: boolean;
  /** Other items that go into one of it. */
  parts?: RecipeImportPart[];
}

export interface NewMaterialInput {
  /** How the lines refer to it before it has an id. */
  key: string;
  name: string;
  /** g, kg, ml, l or pcs. */
  unit: string;
  category?: string;
  /** Per `unit`, when the owner gave a price; absent leaves it with no price (cost incomplete). */
  costPerUnit?: number;
  gramsPerTsp?: number;
  gramsPerPiece?: number;
}

export interface MaterialMemory { materialId: string; gramsPerTsp?: number; gramsPerPiece?: number }

export type RecipeImportPlan =
  | { ok: true; writes: PlannedWrite[]; newMaterialIds: Record<string, string>; menuItemIds: string[] }
  | { ok: false; reason: 'nothing_to_save' | 'unknown_material' | 'unknown_menu_item' | 'invalid_amount' | 'invalid_name' | 'part_loop' };

const round = (n: number) => Math.round(n * 10000) / 10000;

/** Lines of the same material and unit become one line, their amounts added (a cake and its frosting both use sugar). */
export function mergeRecipeLines(lines: IngredientRequirement[]): IngredientRequirement[] {
  const out: IngredientRequirement[] = [];
  for (const l of lines) {
    const same = out.find(o => o.materialId === l.materialId && o.unit === l.unit);
    if (same) same.amount = round(same.amount + l.amount);
    else out.push({ materialId: l.materialId, amount: round(l.amount), unit: l.unit });
  }
  return out;
}

export function planImportRecipes(input: {
  items: RecipeImportItem[];
  newMaterials: NewMaterialInput[];
  remember: MaterialMemory[];
  materials: RawMaterial[];
  menu: MenuItem[];
  /** YYYY-MM-DD in the business's time zone. */
  today: string;
  ctx: PlanContext;
}): RecipeImportPlan {
  const { ctx } = input;
  if (input.items.length === 0) return { ok: false, reason: 'nothing_to_save' };
  const writes: PlannedWrite[] = [];
  const known = new Set(input.materials.map(m => m.id));

  // New materials first, so the recipes can point at them.
  const newMaterialIds: Record<string, string> = {};
  const created: RawMaterial[] = [];
  for (const nm of input.newMaterials) {
    const name = nm.name.trim();
    if (!name || name.length > 80) return { ok: false, reason: 'invalid_name' };
    const id = ctx.newId();
    newMaterialIds[nm.key] = id;
    const cost = nm.costPerUnit !== undefined && nm.costPerUnit > 0 ? parseFloat(nm.costPerUnit.toFixed(6)) : 0;
    const material: RawMaterial = {
      id, name, unit: nm.unit || 'g', initialStock: 0, costPerUnit: cost, category: nm.category || 'Raw Materials', threshold: 0, dateAdded: input.today,
      ...(nm.gramsPerTsp && nm.gramsPerTsp > 0 && { gramsPerTsp: nm.gramsPerTsp }),
      ...(nm.gramsPerPiece && nm.gramsPerPiece > 0 && { gramsPerPiece: nm.gramsPerPiece }),
    };
    created.push(material);
    writes.push({ collection: 'materials', id, data: material as unknown as Record<string, unknown>, merge: false });
    if (cost > 0) {
      const entry = newPriceLogEntry({ materialId: id, unit: material.unit, unitCost: cost, macAfter: cost, source: 'initial', date: input.today, id: ctx.newId(), now: ctx.now() });
      writes.push({ collection: 'priceLog', id: entry.id, data: entry as unknown as Record<string, unknown>, merge: false });
    }
  }

  // Spoon and piece weights the owner confirmed for existing materials.
  for (const m of input.remember) {
    if (!known.has(m.materialId)) return { ok: false, reason: 'unknown_material' };
    const data: Record<string, unknown> = {};
    if (m.gramsPerTsp && m.gramsPerTsp > 0) data.gramsPerTsp = m.gramsPerTsp;
    if (m.gramsPerPiece && m.gramsPerPiece > 0) data.gramsPerPiece = m.gramsPerPiece;
    if (Object.keys(data).length) writes.push({ collection: 'materials', id: m.materialId, data, merge: true });
  }

  const allMaterials = [...input.materials, ...created];
  const menuItemIds: string[] = [];

  // Every item's recipe, worked out first, so an item made from another saved in the same go is costed with it.
  const recipes: IngredientRequirement[][] = [];
  for (const item of input.items) {
    const recipe: IngredientRequirement[] = [];
    for (const line of item.lines) {
      const materialId = 'existingId' in line.material ? line.material.existingId : newMaterialIds[line.material.newKey];
      if (!materialId || ('existingId' in line.material && !known.has(materialId))) return { ok: false, reason: 'unknown_material' };
      if (!(line.amount > 0) || !Number.isFinite(line.amount)) return { ok: false, reason: 'invalid_amount' };
      recipe.push({ materialId, amount: line.amount, unit: line.unit });
    }
    recipes.push(recipe);
  }

  // Ids for the new items first, in order, so parts can point at items saved in the same go.
  const newIds = input.items.map(item => (item.target.kind === 'new' ? ctx.newId() : null));
  const keyIds = new Map<string, string>();
  input.items.forEach((item, i) => { if (item.key) keyIds.set(item.key, newIds[i] ?? (item.target as { menuItemId: string }).menuItemId); });
  const knownMenu = new Set(input.menu.map(m => m.id));
  const partsOfItem: (ItemPart[] | undefined)[] = [];
  for (const item of input.items) {
    if (!item.parts?.length) { partsOfItem.push(undefined); continue; }
    const parts: ItemPart[] = [];
    for (const p of item.parts) {
      if (!(p.quantity > 0) || !Number.isFinite(p.quantity)) return { ok: false, reason: 'invalid_amount' };
      const id = 'existingId' in p.item ? p.item.existingId : keyIds.get(p.item.newKey);
      if (!id || ('existingId' in p.item && !knownMenu.has(id))) return { ok: false, reason: 'unknown_menu_item' };
      parts.push({ itemId: id, quantity: p.quantity });
    }
    partsOfItem.push(parts);
  }
  /** An item's parts once saved: those it had, with these added (the same part's quantity replaced). */
  const mergedParts = (existing: ItemPart[] | undefined, added: ItemPart[]): ItemPart[] =>
    [...(existing ?? []).filter(p => !added.some(a => a.itemId === p.itemId)), ...added];

  // The menu as it will be, to refuse an item inside itself and to cost new items made from others.
  const finalMenu: MenuItem[] = input.menu.map(m => ({ ...m }));
  input.items.forEach((item, i) => {
    const parts = partsOfItem[i];
    if (item.target.kind === 'new') {
      finalMenu.push({ id: newIds[i]!, name: item.target.name, sellingPrice: 0, recipe: mergeRecipeLines(recipes[i]), ...(parts && { parts }) });
    } else {
      const { menuItemId, mode } = item.target;
      const m = finalMenu.find(x => x.id === menuItemId);
      if (!m) return;
      m.recipe = mode === 'replace' ? mergeRecipeLines(recipes[i]) : mergeRecipeLines([...(m.recipe ?? []), ...recipes[i]]);
      if (parts) m.parts = mergedParts(m.parts, parts);
    }
  });
  for (let i = 0; i < input.items.length; i++) {
    const own = newIds[i] ?? (input.items[i].target as { menuItemId: string }).menuItemId;
    if ((partsOfItem[i] ?? []).some(p => wouldLoop(finalMenu, own, p.itemId))) {
      return { ok: false, reason: 'part_loop' };
    }
  }

  for (const [i, item] of input.items.entries()) {
    const recipe = recipes[i];

    const batch = item.batchMakes && item.batchMakes > 0 && item.batchMakes !== 1 ? { batchMakes: item.batchMakes } : {};
    if (item.target.kind === 'new') {
      const name = item.target.name.trim();
      if (!name || name.length > 80) return { ok: false, reason: 'invalid_name' };
      const id = newIds[i]!;
      const sellingPrice = item.target.sellingPrice && item.target.sellingPrice > 0 ? item.target.sellingPrice : 0;
      const menuItem: MenuItem = {
        id, name, sellingPrice, recipe: mergeRecipeLines(recipe), emoji: item.target.emoji || '🧁', ...batch,
        ...(partsOfItem[i] && { parts: partsOfItem[i] }),
        ...(item.notForSale && { notForSale: true }),
        ...(item.madeToOrder && { madeToOrder: true }),
      };
      // Priced at what it costs with its parts (a cream cake counts its base).
      const costed = finalMenu.map(m => (m.id === id ? menuItem : m));
      const stamp = sellingPrice > 0 ? { ...pricingStamp(costView(menuItem, costed), allMaterials, input.today), pricingIsBaseline: false } : {};
      writes.push({ collection: 'menu', id, data: { ...menuItem, ...stamp } as unknown as Record<string, unknown>, merge: false });
      menuItemIds.push(id);
    } else {
      const { menuItemId, mode } = item.target;
      const existing = input.menu.find(m => m.id === menuItemId);
      if (!existing) return { ok: false, reason: 'unknown_menu_item' };
      const next = mode === 'replace' ? mergeRecipeLines(recipe) : mergeRecipeLines([...(existing.recipe ?? []), ...recipe]);
      writes.push({ collection: 'menu', id: menuItemId, merge: true, data: {
        recipe: next, ...(mode === 'replace' && batch),
        ...(partsOfItem[i] && { parts: mergedParts(existing.parts, partsOfItem[i]!) }),
        ...(item.madeToOrder && { madeToOrder: true }),
      } });
      menuItemIds.push(menuItemId);
    }
  }
  return { ok: true, writes, newMaterialIds, menuItemIds };
}
