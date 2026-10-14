/**
 * quickRecipes.ts
 *
 * The phone's recipe reader, beside the save endpoints in quickRoutes.ts and wired up the same way in server.ts:
 *  - GET /mobile/recipes/setup: the owner's materials and menu, which the phone's check screen matches ingredients to
 *    and works costs out from (the same utils/recipeDraft the web runs).
 *  - POST /mobile/recipes/read is lib/recipeParseRoutes.ts' handler, the web's, with the same limits.
 *  - POST /mobile/recipes: saves what the check screen settled (utils/recipeDraft's `draftToImport`), through
 *    plans/planRecipes in one transaction that reads the materials and menu items it touches first, so a material
 *    deleted while the owner was checking is refused rather than pointed at.
 */
import type { AuthedRequest } from './auth';
import type { Response } from 'express';
import { planImportRecipes, type MaterialMemory, type NewMaterialInput, type RecipeImportItem, type RecipeImportLine } from '../src/utils/plans/planRecipes';
import type { RecipeMaterialView, RecipeSetupView, RecipesSaved } from '../src/utils/quickApiTypes';
import { todayInZone } from '../src/utils/localDate';
import type { MenuItem, RawMaterial } from '../src/types';
import { asMenu, currencyOf, failure, loadSettings, writeHandler, type QuickRouteDeps, type Read } from './quickRoutes';

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const ID = /^[A-Za-z0-9_.-]{1,80}$/;
const NEW_KEY = /^n\d{1,3}$/;
const UNIT = /^[A-Za-z]{1,8}$/;
const bad = (error: string): { ok: false; error: string } => ({ ok: false, error });
const positive = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max;
const optional = (v: unknown, max: number): v is number | undefined => v === undefined || positive(v, max);
const name = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '' && v.trim().length <= 80;

export const RECIPE_SAVE_MAX_ITEMS = 20;
export const RECIPE_SAVE_MAX_LINES = 80;
export const RECIPE_SAVE_MAX_NEW = 120;

export interface RecipeImportBody { items: RecipeImportItem[]; newMaterials: NewMaterialInput[]; remember: MaterialMemory[] }

/** The body of POST /mobile/recipes: utils/recipeDraft's `DraftImport`, checked piece by piece. */
export function readRecipeImportBody(body: unknown): Read<RecipeImportBody> {
  if (!isObject(body) || !Array.isArray(body.items) || !Array.isArray(body.newMaterials ?? []) || !Array.isArray(body.remember ?? [])) {
    return bad('Send { items, newMaterials, remember }.');
  }
  if (body.items.length < 1 || body.items.length > RECIPE_SAVE_MAX_ITEMS) return bad(`Save between 1 and ${RECIPE_SAVE_MAX_ITEMS} recipes at a time.`);

  const newMaterials: NewMaterialInput[] = [];
  const keys = new Set<string>();
  const rawNew = (body.newMaterials ?? []) as unknown[];
  if (rawNew.length > RECIPE_SAVE_MAX_NEW) return bad('Too many new materials at once.');
  for (const n of rawNew) {
    if (!isObject(n) || typeof n.key !== 'string' || !NEW_KEY.test(n.key) || keys.has(n.key)) return bad('Each new material needs its own key.');
    if (!name(n.name)) return bad('Each new material needs a name of up to 80 letters.');
    if (typeof n.unit !== 'string' || !['g', 'ml', 'pcs', 'kg', 'l'].includes(n.unit)) return bad('A new material is kept in g, ml or pcs.');
    if (!optional(n.costPerUnit, 1_000_000) || !optional(n.gramsPerTsp, 100) || !optional(n.gramsPerPiece, 10_000)) return bad('A new material has a price or weight out of range.');
    keys.add(n.key);
    newMaterials.push({
      key: n.key, name: n.name.trim(), unit: n.unit,
      ...(n.costPerUnit !== undefined && { costPerUnit: n.costPerUnit }),
      ...(n.gramsPerTsp !== undefined && { gramsPerTsp: n.gramsPerTsp }),
      ...(n.gramsPerPiece !== undefined && { gramsPerPiece: n.gramsPerPiece }),
    });
  }

  const items: RecipeImportItem[] = [];
  for (const it of body.items as unknown[]) {
    if (!isObject(it) || !isObject(it.target) || !Array.isArray(it.lines)) return bad('Each recipe needs a target and lines.');
    const t = it.target;
    let target: RecipeImportItem['target'];
    if (t.kind === 'new') {
      if (!name(t.name)) return bad('Each new item needs a name of up to 80 letters.');
      if (!optional(t.sellingPrice, 10_000_000)) return bad('A selling price is out of range.');
      target = { kind: 'new', name: t.name.trim(), ...(t.sellingPrice !== undefined && { sellingPrice: t.sellingPrice }) };
    } else if (t.kind === 'existing' && typeof t.menuItemId === 'string' && ID.test(t.menuItemId) && (t.mode === 'replace' || t.mode === 'add')) {
      target = { kind: 'existing', menuItemId: t.menuItemId, mode: t.mode };
    } else return bad('A recipe goes to a new item, or replaces or adds to an existing one.');
    if (it.lines.length > RECIPE_SAVE_MAX_LINES) return bad('A recipe has too many ingredients.');
    const lines: RecipeImportLine[] = [];
    for (const l of it.lines as unknown[]) {
      if (!isObject(l) || !isObject(l.material)) return bad('Each ingredient needs a material.');
      const m = l.material;
      let material: RecipeImportLine['material'];
      if (typeof m.existingId === 'string' && ID.test(m.existingId)) material = { existingId: m.existingId };
      else if (typeof m.newKey === 'string' && keys.has(m.newKey)) material = { newKey: m.newKey };
      else return bad('An ingredient points at a material that is not there.');
      if (!positive(l.amount, 1_000_000)) return bad('Each ingredient needs an amount above nothing.');
      if (typeof l.unit !== 'string' || !UNIT.test(l.unit)) return bad('Each ingredient needs a unit.');
      lines.push({ material, amount: l.amount, unit: l.unit });
    }
    if (it.batchMakes !== undefined && !positive(it.batchMakes, 10_000)) return bad('How many one batch makes must be above nothing.');
    items.push({ target, lines, ...(it.batchMakes !== undefined && { batchMakes: it.batchMakes as number }) });
  }

  const remember: MaterialMemory[] = [];
  const rawRemember = (body.remember ?? []) as unknown[];
  if (rawRemember.length > 300) return bad('Too many weights to remember.');
  for (const r of rawRemember) {
    if (!isObject(r) || typeof r.materialId !== 'string' || !ID.test(r.materialId)) return bad('Each remembered weight needs a material.');
    if (!optional(r.gramsPerTsp, 100) || !optional(r.gramsPerPiece, 10_000)) return bad('A remembered weight is out of range.');
    remember.push({
      materialId: r.materialId,
      ...(r.gramsPerTsp !== undefined && { gramsPerTsp: r.gramsPerTsp }),
      ...(r.gramsPerPiece !== undefined && { gramsPerPiece: r.gramsPerPiece }),
    });
  }
  return { ok: true, value: { items, newMaterials, remember } };
}

const view = (m: RawMaterial): RecipeMaterialView => ({
  id: m.id, name: m.name || 'Material', unit: m.unit || 'g',
  ...(m.costPerUnit > 0 && { costPerUnit: m.costPerUnit }),
  ...(m.gramsPerTsp && m.gramsPerTsp > 0 && { gramsPerTsp: m.gramsPerTsp }),
  ...(m.gramsPerPiece && m.gramsPerPiece > 0 && { gramsPerPiece: m.gramsPerPiece }),
});

/** GET /mobile/recipes/setup. Read-only. */
export function createQuickRecipeSetupHandler(deps: QuickRouteDeps) {
  return async (req: AuthedRequest, res: Response) => {
    try {
      const body = await deps.db.run(req.uid!, async (tx): Promise<RecipeSetupView> => {
        const [settings, materials, menu] = await Promise.all([loadSettings(tx), tx.all('materials'), tx.all('menu')]);
        const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
        return {
          materials: (materials as unknown as RawMaterial[]).map(view).sort(byName),
          menu: (menu as unknown as MenuItem[]).map(m => ({ id: m.id, name: m.name || 'Item' })).sort(byName),
          currency: currencyOf(settings as Parameters<typeof currencyOf>[0]),
        };
      });
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json(body);
    } catch (err: unknown) {
      console.error('Quick recipe setup failed:', (err as Error)?.message);
      return res.status(500).json({ error: 'Could not load your materials. Please try again.', code: 'read_failed' });
    }
  };
}

/** POST /mobile/recipes: saves recipes the owner checked on the phone, as the web's Save does. */
export function createQuickRecipeSaveHandler(deps: QuickRouteDeps) {
  return writeHandler(deps, 'recipes', readRecipeImportBody, async (tx, input) => {
    const settings = await loadSettings(tx);
    const existingIds = [
      ...input.items.flatMap(i => i.lines.flatMap(l => ('existingId' in l.material ? [l.material.existingId] : []))),
      ...input.remember.map(r => r.materialId),
    ];
    const menuIds = input.items.flatMap(i => (i.target.kind === 'existing' ? [i.target.menuItemId] : []));
    const [materials, menu] = await Promise.all([tx.getMany('materials', existingIds), tx.getMany('menu', menuIds)]);
    const plan = planImportRecipes({
      ...input,
      materials: [...materials.values()] as unknown as RawMaterial[],
      menu: asMenu(menu),
      today: todayInZone(settings.timezone, new Date(deps.now())),
      ctx: { newId: deps.newId, now: deps.now },
    });
    if (plan.ok === false) {
      if (plan.reason === 'unknown_material' || plan.reason === 'unknown_menu_item') {
        return failure(409, 'A material or menu item in these recipes was changed or deleted while you were checking them. Read the recipe again.', { code: plan.reason });
      }
      return failure(422, 'Something in these recipes could not be saved. Check the names and amounts.', { code: plan.reason });
    }
    tx.apply(plan.writes);
    const saved: RecipesSaved = { menuItemIds: plan.menuItemIds, newMaterials: Object.keys(plan.newMaterialIds).length };
    return { status: 201, body: saved };
  });
}
