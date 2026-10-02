/**
 * orderPricing.ts
 *
 * What an order sold for and what it cost, as they were when the order was
 * created. Every figure that values an order (the dashboard's income and
 * profit, the Orders tab, bills and statements) reads these helpers, so a
 * later change to a menu price or a material cost can never rewrite history.
 *
 * When an order is created it is "stamped" with the unit price, the unit
 * ingredient and packaging cost, the unit input GST and the item name at that
 * moment (see `stampFor`). Orders made before stamping existed have none of
 * these, and fall back to today's menu and material values; those figures are
 * flagged `estimated` so the UI can say so. Old orders are deliberately NOT
 * back-filled: that would freeze today's prices into last year's orders.
 *
 * Pure and dependency-light (types and unit conversion only) so the browser,
 * the server and tests all use the same code.
 */
import type { IngredientRequirement, MenuItem, Order, RawMaterial } from '../types';
import { convertAmount } from './conversions';

/** Materials in this category are packaging; everything else is an ingredient. */
export const PACKAGING_CATEGORY = 'Packaging Materials';

/** The least a menu item must have to be priced or stamped. */
export type PricedItem = Pick<MenuItem, 'name' | 'sellingPrice' | 'recipe'>;
/** The least a material must have to be costed. */
export type CostedMaterial = Pick<RawMaterial, 'id' | 'unit' | 'costPerUnit' | 'category'> & { gstRate?: number };

const round6 = (n: number) => parseFloat(n.toFixed(6));
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export interface UnitCosts {
  /** Ingredient cost of one unit, excluding input GST. */
  ingredients: number;
  /** Packaging cost of one unit, excluding input GST. */
  packaging: number;
  /** Input GST contained in those costs, for the "GST paid" figure. Not a cost. */
  inputGst: number;
}

/** Cost of one unit of a recipe at the given material costs, split into ingredients and packaging. */
export function recipeUnitCosts(recipe: IngredientRequirement[], materials: CostedMaterial[]): UnitCosts {
  const total: UnitCosts = { ingredients: 0, packaging: 0, inputGst: 0 };
  for (const req of recipe) {
    const mat = materials.find(m => m.id === req.materialId);
    if (!mat) continue;
    const cost = convertAmount(req.amount, req.unit || 'g', mat.unit) * (mat.costPerUnit || 0);
    if (mat.category === PACKAGING_CATEGORY) total.packaging += cost; else total.ingredients += cost;
    total.inputGst += cost * ((mat.gstRate || 0) / 100);
  }
  return total;
}

/** The fields written onto a new order. All optional on `Order`, so old orders stay valid. */
export type OrderStamp = Required<Pick<Order,
  'unitPriceAtSale' | 'unitIngredientCostAtSale' | 'unitPackagingCostAtSale' | 'unitInputGstAtSale' | 'itemNameAtSale'>>;

/**
 * The stamp for an order of `item` made now. `unitPrice` overrides the menu
 * price when the real price paid is known (an imported Shopify or Odoo line;
 * a missing, zero or non-numeric price falls back to the menu price).
 */
export function stampFor(item: PricedItem, materials: CostedMaterial[], unitPrice?: number): OrderStamp {
  const costs = recipeUnitCosts(item.recipe || [], materials);
  return {
    unitPriceAtSale: round6(isNumber(unitPrice) && unitPrice > 0 ? unitPrice : item.sellingPrice || 0),
    unitIngredientCostAtSale: round6(costs.ingredients),
    unitPackagingCostAtSale: round6(costs.packaging),
    unitInputGstAtSale: round6(costs.inputGst),
    itemNameAtSale: item.name,
  };
}

/** Stamped price if present, else the menu item's current price (estimated). */
export function resolveUnitPrice(order: Order, menu: Pick<MenuItem, 'id' | 'sellingPrice'>[]): { value: number; estimated: boolean } {
  if (isNumber(order.unitPriceAtSale)) return { value: order.unitPriceAtSale, estimated: false };
  const item = menu.find(m => m.id === order.menuItemId);
  return { value: item?.sellingPrice || 0, estimated: true };
}

/**
 * Stamped costs if the order has them, else the recipe at today's material
 * costs (estimated). An order stamped before input GST was recorded keeps its
 * stamped costs; only its input GST is then estimated.
 */
export function resolveUnitCosts(
  order: Order,
  menu: Pick<MenuItem, 'id' | 'recipe'>[],
  materials: CostedMaterial[]
): UnitCosts & { estimated: boolean } {
  const hasCosts = isNumber(order.unitIngredientCostAtSale) && isNumber(order.unitPackagingCostAtSale);
  if (hasCosts && isNumber(order.unitInputGstAtSale)) {
    return {
      ingredients: order.unitIngredientCostAtSale!, packaging: order.unitPackagingCostAtSale!,
      inputGst: order.unitInputGstAtSale, estimated: false,
    };
  }
  const item = menu.find(m => m.id === order.menuItemId);
  const current = recipeUnitCosts(item?.recipe || [], materials);
  return {
    ingredients: hasCosts ? order.unitIngredientCostAtSale! : current.ingredients,
    packaging: hasCosts ? order.unitPackagingCostAtSale! : current.packaging,
    inputGst: current.inputGst,
    estimated: true,
  };
}

/** The item's name as sold, so a renamed or deleted menu item doesn't blank old bills. */
export function resolveItemName(order: Order, menu: Pick<MenuItem, 'id' | 'name'>[]): string {
  return order.itemNameAtSale || menu.find(m => m.id === order.menuItemId)?.name || 'Item';
}
