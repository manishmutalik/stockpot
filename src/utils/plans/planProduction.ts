/**
 * planProduction.ts
 *
 * What logging a production run (or a whole session of them) will write, worked
 * out without touching Firebase. Moved out of `useProductionActions` so the web
 * and the phone app's server endpoint run the same rules: the run's ingredients
 * are deducted, its yield is added to finished stock, and the run is recorded
 * with its expiry date.
 *
 * Each run starts from the stock the previous one left (`Working`), so two items
 * that share an ingredient, or the same item entered twice, add up instead of the
 * later write replacing the earlier one.
 */
import type { MenuItem, RawMaterial } from '../../types';
import type { ProductionRun } from '../../components/ProductionRunModal';
import { planIngredientDeduction } from '../inventoryDeduction';
import { convertAmount } from '../conversions';
import { collapseWrites, type PlanContext, type PlanError, type PlannedWrite } from './types';

/** The stock the next step must start from. */
export type Working = { materials: RawMaterial[]; menu: MenuItem[] };

/**
 * What `quantity` units of a recipe cost in materials, at the materials' current costs per unit (each ingredient amount is
 * converted to the material's own unit first; an ingredient whose material is missing adds nothing). A run stores this,
 * rounded to two decimals, as its `costTotal`.
 */
export function productionRunCost(
  recipe: { materialId: string; amount: number; unit?: string }[],
  materials: Pick<RawMaterial, 'id' | 'unit' | 'costPerUnit'>[],
  quantity: number
): number {
  return recipe.reduce((sum, req) => {
    const mat = materials.find(m => m.id === req.materialId);
    if (!mat) return sum;
    return sum + convertAmount(req.amount, req.unit || 'g', mat.unit) * mat.costPerUnit * quantity;
  }, 0);
}

export type ProductionRunInput = Omit<ProductionRun, 'id' | 'createdAt' | 'purpose'>;

export type ProductionRunPlan =
  | { ok: true; writes: PlannedWrite[]; runId: string; state: Working }
  | { ok: false; error: PlanError };

/**
 * One run: deducts its ingredients, adds its yield to the item's finished stock, and writes the run record. Every run
 * adds to available stock; what it is eventually used for is decided later, when it is consumed from stock.
 */
export function planProductionRun(runData: ProductionRunInput, state: Working, ctx: PlanContext): ProductionRunPlan {
  // The selected recipe must exist in the current menu — a stale/unknown id (e.g. a UI default picked before the
  // real menu loaded) would otherwise silently create a nameless phantom `menu/{recipeId}` doc and a dangling Order,
  // both of which render with a blank item name.
  const recipeItem = state.menu.find(m => m.id === runData.recipeId);
  if (!recipeItem) {
    return { ok: false, error: {
      code: 'unknown_recipe', title: 'Error',
      message: 'Selected recipe could not be found. Please reselect it and try again.',
      thrown: `logProductionRun: no menu item found for recipeId "${runData.recipeId}"`,
    } };
  }

  const id = ctx.newId();

  // Firestore does not accept `undefined` — build object only with defined fields
  let expiryDate = undefined;
  if (recipeItem?.shelfLifeDays) {
    const d = new Date(runData.date);
    d.setDate(d.getDate() + recipeItem.shelfLifeDays);
    expiryDate = d.toISOString().split('T')[0];
  }
  const yieldAmt = runData.quantityYield ?? runData.quantityProduced;
  const run: Record<string, any> = {
    id,
    recipeId: runData.recipeId,
    quantityProduced: runData.quantityProduced,
    remainingQuantity: yieldAmt,
    ...(expiryDate && { expiryDate }),
    date: runData.date,
    costTotal: runData.costTotal,
    createdAt: ctx.now(),
  };
  if (runData.quantityYield !== undefined) run.quantityYield = runData.quantityYield;
  if (runData.notes) run.notes = runData.notes;
  if (runData.productionSessionId) run.productionSessionId = runData.productionSessionId;

  // 1. Deduct raw materials.
  const deduction = planIngredientDeduction(state.materials, recipeItem.recipe, runData.quantityProduced);
  const writes: PlannedWrite[] = deduction.updates.map(u => ({
    collection: 'materials' as const, id: u.materialId, data: { initialStock: u.stock }, merge: true,
  }));

  // 2. Add finished goods.
  const currentStock = recipeItem.finishedGoodsStock ?? 0;
  writes.push({ collection: 'menu', id: runData.recipeId, data: { finishedGoodsStock: currentStock + yieldAmt }, merge: true });

  // 3. The run record.
  writes.push({ collection: 'productionRuns', id, data: run, merge: false });

  return {
    ok: true, writes, runId: id,
    state: {
      materials: deduction.materials,
      menu: state.menu.map(m => (m.id === runData.recipeId ? { ...m, finishedGoodsStock: currentStock + yieldAmt } : m)),
    },
  };
}

export type ProductionSessionPlan =
  | { ok: true; writes: PlannedWrite[]; runIds: string[]; sessionId?: string; state: Working }
  | { ok: false; error: PlanError; /** The row that could not be planned. */ failedIndex: number };

/**
 * A whole session as one plan, for a caller that saves it in one transaction (the phone app's server). More than one row
 * shares a `productionSessionId`; a single row gets none. Every document is written once, with the net result of all rows.
 * (The web saves a session row by row, so a failure part-way leaves earlier rows recorded; it plans each row itself.)
 */
export function planProductionSession(rows: ProductionRunInput[], state: Working, ctx: PlanContext, existingSessionId?: string): ProductionSessionPlan {
  const isSession = rows.length > 1 || !!existingSessionId;
  const sessionId = isSession ? (existingSessionId || ctx.newId()) : undefined;
  let working = state;
  const writes: PlannedWrite[] = [];
  const runIds: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const plan = planProductionRun({ ...rows[i], ...(sessionId && { productionSessionId: sessionId }) }, working, ctx);
    if (plan.ok === false) return { ok: false, error: plan.error, failedIndex: i };
    writes.push(...plan.writes);
    runIds.push(plan.runId);
    working = plan.state;
  }
  return { ok: true, writes: collapseWrites(writes), runIds, sessionId, state: working };
}
