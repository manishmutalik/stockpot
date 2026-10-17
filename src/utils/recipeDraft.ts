/**
 * recipeDraft.ts
 *
 * The recipe check screen's state, as plain data with pure functions, so what the owner sees and what is saved are
 * worked out the same way and tested. A draft is made from what the reader returned (utils/recipeParse); the owner
 * edits it (matches, amounts, answers, new materials, what a component belongs to); `draftToImport` turns it into
 * what plans/planRecipes writes.
 *
 *  - Each ingredient is matched to an existing material (the model's match, else utils/kitchenMeasures'
 *    `matchMaterialByName`), or to a new material: the same name in several recipes is one new material.
 *  - A recipe the reader marked as a component (whipped cream, ganache, a sponge base) must be settled by the owner: sold
 *    on its own; mixed into another item each time, with how many of that item one batch covers (its ingredients are
 *    written into that item's recipe); or made ahead and kept, saved as its own item not sold on the menu, with its batch
 *    size, and used as a part of another item (utils/itemParts), so many to one of it. One made ahead can be counted in
 *    pieces (a sponge base) or by weight or volume (a ganache: utils/itemUnits): then its batch size and how much goes into
 *    one are in kg (litres), its recipe is per kg, and "makes 800 g" in the recipe is read as 0.8 kg.
 *  - A sold recipe can be made when ordered (utils/madeToOrder).
 *  - A recipe whose name is an existing menu item replaces that item's recipe unless the owner chooses otherwise.
 *  - Nothing can be saved while a question is open: `draftIssues` lists them.
 */
import type { ItemUnitByMeasure, MenuItem, RawMaterial } from '../types';
import { convertAmount } from './conversions';
import { matchMaterialByName, parseAmount, perItem, resolveLine, suggestMaterialUnit, type LineAnswers, type LineQuestion, type LineResolution } from './kitchenMeasures';
import { defaultEntryUnit, ENTRY_UNITS, familyOf, fromEntryUnit, inEntryUnit, itemUnit, type EntryUnit, type ItemUnit } from './itemUnits';
import { squash } from './orderParse';
import type { MaterialMemory, NewMaterialInput, RecipeImportItem, RecipeImportLine } from './plans/planRecipes';
import type { ParsedIngredient, ParsedRecipes } from './recipeParse';

/** What the draft needs of a material and a menu item (the phone has only these: quickApiTypes' RecipeSetupView). */
export type DraftMaterial = Pick<RawMaterial, 'id' | 'name' | 'unit'> & Partial<Pick<RawMaterial, 'costPerUnit' | 'gramsPerTsp' | 'gramsPerPiece'>>;
export type DraftMenuItem = Pick<MenuItem, 'id' | 'name'> & Partial<Pick<MenuItem, 'countedIn'>>;

export type LineChoice = { kind: 'existing'; id: string } | { kind: 'new'; key: string } | { kind: 'skip' };

export interface DraftLine {
  key: string;
  ingredient: ParsedIngredient;
  choice: LineChoice;
  answers: LineAnswers;
}

/**
 * What a recipe is for. A component starts `undecided` until the owner says. `of` is `recipe:<key>` or `menu:<id>`.
 * `part`: mixed into that item each time. `kept`: made ahead and kept as its own item, used in `of` (when set), `perItem`
 * of it in one of that item.
 */
export type DraftUse =
  | { kind: 'sell' }
  | { kind: 'part'; of: string | null; covers: number | null }
  | { kind: 'kept'; of: string | null; perItem: number | null }
  | { kind: 'undecided' };
export type DraftTarget = { kind: 'new' } | { kind: 'existing'; menuItemId: string; mode: 'replace' | 'add' };

export interface DraftRecipe {
  key: string;
  include: boolean;
  name: string;
  makes: number | null;
  makesAsWritten?: string;
  looksLikeComponent: boolean;
  looksCutOff: boolean;
  notes?: string;
  use: DraftUse;
  target: DraftTarget;
  sellingPrice: number | null;
  /** A sold item made when it is ordered (utils/madeToOrder). */
  madeToOrder?: boolean;
  /** Counted by weight or volume, as "One batch makes" was typed: `makes` (and a kept one's `perItem`) are then in kg (litres). */
  countedIn?: ItemUnitByMeasure;
  /** What the recipe says one batch makes, when it says a weight or volume ("800 g", "1.5 litres"), in kg (litres). */
  measuredYield?: MeasuredYield;
  /** What "One batch makes" is typed in, as chosen beside it (utils/itemUnits); absent: the default for the item's unit. */
  makesIn?: EntryUnit;
  /** How many pieces the reader found one batch makes, kept to go back to from a weight. */
  makesRead?: number;
  lines: DraftLine[];
}

/** A yield read as a weight or volume: in kg (litres), and the unit it was written in. */
export interface MeasuredYield { unit: ItemUnitByMeasure; amount: number; writtenIn: EntryUnit }

export interface DraftNewMaterial {
  key: string;
  name: string;
  unit: 'g' | 'ml' | 'pcs';
  /** Per kg, per litre or per piece, as owners buy; null when not known yet. */
  pricePerBuyUnit: number | null;
}

export interface RecipeDraft {
  recipes: DraftRecipe[];
  newMaterials: DraftNewMaterial[];
  moreNotRead: boolean;
  fromPhotos: boolean;
}

/** "kg" for something kept in g, "litre" for ml, "piece" for pcs: what a new material's price is asked per. */
export const BUY_UNIT: Record<DraftNewMaterial['unit'], string> = { g: 'kg', ml: 'litre', pcs: 'piece' };
const PER_BUY_UNIT: Record<DraftNewMaterial['unit'], number> = { g: 1000, ml: 1000, pcs: 1 };

const capitalise = (s: string) => s.trim().charAt(0).toUpperCase() + s.trim().slice(1);

const WEIGHT_UNITS: Record<string, { unit: ItemUnitByMeasure; per: number }> = {
  kg: { unit: 'kg', per: 1 }, kgs: { unit: 'kg', per: 1 }, kilo: { unit: 'kg', per: 1 }, kilos: { unit: 'kg', per: 1 }, kilogram: { unit: 'kg', per: 1 }, kilograms: { unit: 'kg', per: 1 },
  g: { unit: 'kg', per: 0.001 }, gm: { unit: 'kg', per: 0.001 }, gms: { unit: 'kg', per: 0.001 }, gram: { unit: 'kg', per: 0.001 }, grams: { unit: 'kg', per: 0.001 }, gr: { unit: 'kg', per: 0.001 },
  l: { unit: 'l', per: 1 }, ltr: { unit: 'l', per: 1 }, litre: { unit: 'l', per: 1 }, litres: { unit: 'l', per: 1 }, liter: { unit: 'l', per: 1 }, liters: { unit: 'l', per: 1 },
  ml: { unit: 'l', per: 0.001 },
};

/**
 * A yield written as a weight or volume ("800 g", "about 1.5 kg", "½ litre"), in kg (litres), with the unit it was written in;
 * null for anything else.
 */
export function measuredYield(asWritten: string | undefined): MeasuredYield | null {
  if (!asWritten) return null;
  const m = asWritten.toLowerCase().match(/(\d+(?:\.\d+)?(?:\s*\/\s*\d+)?|\d*\s*[½¼¾])\s*(kilograms?|kilos?|kgs?|grams?|gms?|gm|gr|g|litres?|liters?|ltr|ml|l)\b/);
  if (!m) return null;
  const amount = parseAmount(m[1].replace(/\s*\/\s*/, '/'));
  const unit = WEIGHT_UNITS[m[2]];
  if (amount === null || !unit) return null;
  const total = Math.round(amount * unit.per * 1e6) / 1e6;
  return total > 0 ? { unit: unit.unit, amount: total, writtenIn: unit.per === 1 ? unit.unit : unit.unit === 'kg' ? 'g' : 'ml' } : null;
}

/** Whether the check screen asks what the recipe is for (sold, mixed in, made ahead): a component, or a yield by weight. */
export const asksWhatItIs = (recipe: DraftRecipe): boolean =>
  recipe.looksLikeComponent || !!recipe.measuredYield || recipe.use.kind !== 'sell';

/** The item on the menu a recipe goes to, when it goes to one. */
const targetItem = (recipe: DraftRecipe, menu: DraftMenuItem[]): DraftMenuItem | undefined =>
  recipe.target.kind === 'existing' ? menu.find(m => m.id === (recipe.target as { menuItemId: string }).menuItemId) : undefined;

/**
 * The unit a recipe's item is counted in: what "One batch makes" was typed in (utils/itemUnits); until a unit is chosen for
 * a recipe going to an item already on the menu, that item's own. A component mixed into another item has no unit.
 */
export function recipeUnit(recipe: DraftRecipe, menu: DraftMenuItem[]): ItemUnit {
  if (recipe.use.kind !== 'kept' && recipe.use.kind !== 'sell') return 'pcs';
  if (recipe.target.kind === 'existing' && !recipe.makesIn) return itemUnit(targetItem(recipe, menu));
  return itemUnit(recipe);
}

/** What saving does to an item already on the menu whose unit changes, for the check screen; null when nothing changes. */
export function unitChangeNote(recipe: DraftRecipe, menu: DraftMenuItem[]): string | null {
  const change = unitChange(recipe, menu);
  const existing = targetItem(recipe, menu);
  if (change === undefined || !existing) return null;
  const word = change === 'kg' ? 'kg' : change === 'l' ? 'litres' : 'pieces';
  return `Saving counts ${existing.name} in ${word} from now on${change ? ', made for other items (not sold on the menu)' : ''}. Any stock of it counted the old way is cleared, and items that use it keep their numbers, now in ${word}: check them on the Menu.`;
}

/**
 * The unit an item already on the menu changes to when saved ('kg', 'l', or null for pieces); undefined when it keeps its
 * own (or the recipe makes a new item).
 */
export function unitChange(recipe: DraftRecipe, menu: DraftMenuItem[]): ItemUnitByMeasure | null | undefined {
  const existing = targetItem(recipe, menu);
  if (!existing || (recipe.use.kind !== 'kept' && recipe.use.kind !== 'sell')) return undefined;
  const unit = recipeUnit(recipe, menu);
  return unit === itemUnit(existing) ? undefined : unit === 'pcs' ? null : unit;
}

/** What "One batch makes" is typed in: the unit chosen beside it, or by default pieces, g or kg (ml or litres). */
export function makesUnitOf(recipe: DraftRecipe, menu: DraftMenuItem[]): EntryUnit {
  const unit = recipeUnit(recipe, menu);
  if (recipe.makesIn && familyOf(recipe.makesIn) === unit) return recipe.makesIn;
  return defaultEntryUnit(unit, recipe.makes);
}

/**
 * The units "One batch makes" can be typed in: any. For an item already on the menu, a different kind (kg for one counted
 * in pieces) changes what it is counted in when saved (`unitChange`).
 */
export const makesUnitsFor = (_recipe: DraftRecipe, _menu: DraftMenuItem[]): EntryUnit[] => ENTRY_UNITS.map(u => u.value);

/** "One batch makes" as typed, in its unit (400 for 0.4 kg shown in g). */
export const makesShown = (recipe: DraftRecipe, menu: DraftMenuItem[]): number | null =>
  recipe.makes === null ? null : inEntryUnit(recipe.makes, makesUnitOf(recipe, menu));

/** Sets "One batch makes" from what was typed, in the unit beside it. */
export function setMakes(recipe: DraftRecipe, typed: number | null, menu: DraftMenuItem[]): void {
  recipe.makes = typed === null || !(typed > 0) ? null : fromEntryUnit(typed, makesUnitOf(recipe, menu));
}

/**
 * Chooses the unit beside "One batch makes": the number typed stays and now means that unit (1.5 is 1.5 kg once kg is
 * chosen). It is also what the item is counted in: pieces, or by weight (g, kg) or volume (ml, litres), for a new item or
 * one already on the menu (`unitChange`). Changing between pieces and weight starts "how much goes into one" again, as its
 * meaning changes.
 */
export function setMakesUnit(recipe: DraftRecipe, unit: EntryUnit, menu: DraftMenuItem[]): void {
  const shown = makesShown(recipe, menu);
  const before = recipeUnit(recipe, menu);
  const family = familyOf(unit);
  if (family === 'pcs') delete recipe.countedIn; else recipe.countedIn = family;
  recipe.makesIn = unit;
  recipe.makes = shown === null ? null : fromEntryUnit(shown, unit);
  if (before !== family && recipe.use.kind === 'kept') recipe.use.perItem = family === 'pcs' ? 1 : null;
}

/**
 * What the recipe is for, as the owner chooses it. Made ahead and kept, it starts counted as the recipe gives its yield (by
 * weight for "makes 400 g"), or as the item on the menu it goes to is. Sold, it starts in pieces (selling by weight comes
 * later). Mixed into another item, it has no batch of its own.
 */
export function chooseUse(recipe: DraftRecipe, kind: Exclude<DraftUse['kind'], 'undecided'>, menu: DraftMenuItem[] = []): void {
  delete recipe.makesIn;
  if (kind === 'kept') {
    const existing = recipe.target.kind === 'existing' ? menu.find(m => m.id === (recipe.target as { menuItemId: string }).menuItemId) : undefined;
    const unit = existing ? (existing.countedIn ?? null) : recipe.measuredYield?.unit ?? null;
    recipe.use = { kind: 'kept', of: null, perItem: unit ? null : 1 };
    if (unit) recipe.countedIn = unit; else delete recipe.countedIn;
    if (recipe.measuredYield && recipe.measuredYield.unit === unit) {
      recipe.makes = recipe.measuredYield.amount;
      recipe.makesIn = recipe.measuredYield.writtenIn;
    } else {
      recipe.makes = recipe.makesRead ?? null;
    }
    return;
  }
  recipe.use = kind === 'sell' ? { kind: 'sell' } : { kind: 'part', of: null, covers: null };
  delete recipe.countedIn;
  recipe.makes = recipe.makesRead ?? null;
}

/**
 * What one batch's ingredients weigh together, in kg (litres for a recipe counted in litres; 1 ml is taken as 1 g), when
 * every line is worked out in grams or millilitres: a starting point for the batch size of something made by weight.
 */
export function batchWeight(draft: RecipeDraft, recipe: DraftRecipe, materials: DraftMaterial[]): number | null {
  let grams = 0;
  for (const l of recipe.lines) {
    if (l.choice.kind === 'skip') continue;
    const res = resolveDraftLine(draft, recipe, l, materials);
    if (!res || res.status !== 'ok') return null;
    if (res.skipped) continue;
    if (res.recipeUnit !== 'g' && res.recipeUnit !== 'ml') return null;
    grams += res.batchAmount;
  }
  return grams > 0 ? Math.round(grams) / 1000 : null;
}

export function buildDraft(parsed: ParsedRecipes, input: { materials: DraftMaterial[]; menu: DraftMenuItem[]; fromPhotos: boolean; forMenuItemId?: string }): RecipeDraft {
  const newMaterials: DraftNewMaterial[] = [];
  const newKeyFor = (ingredient: ParsedIngredient): string => {
    const name = squash(ingredient.nameAsWritten);
    const found = newMaterials.find(n => squash(n.name) === name);
    if (found) return found.key;
    const key = `n${newMaterials.length + 1}`;
    newMaterials.push({ key, name: capitalise(ingredient.nameAsWritten), unit: suggestMaterialUnit(ingredient), pricePerBuyUnit: null });
    return key;
  };
  const single = parsed.recipes.length === 1;
  const recipes = parsed.recipes.map((r, ri): DraftRecipe => {
    const name = r.name ?? '';
    const existing = single && input.forMenuItemId
      ? input.menu.find(m => m.id === input.forMenuItemId)
      : (name ? input.menu.find(m => squash(m.name) === squash(name)) : undefined);
    // "Makes 800 g" is a weight, not 800 pieces: kept to count the item by weight if it is made ahead and kept.
    const weighed = measuredYield(r.makesAsWritten);
    const makesRead = weighed ? undefined : r.makes;
    return {
      key: `r${ri + 1}`,
      include: true,
      name: existing && !name ? existing.name : name,
      makes: makesRead ?? null,
      ...(makesRead !== undefined && { makesRead }),
      ...(weighed && { measuredYield: weighed }),
      ...(r.makesAsWritten && { makesAsWritten: r.makesAsWritten }),
      looksLikeComponent: r.looksLikeComponent,
      looksCutOff: r.looksCutOff,
      ...(r.notes && { notes: r.notes }),
      // A yield written as a weight (a ganache that makes 400 g) is asked about like a component: it is usually kept and
      // used by weight in other items, and is never 400 pieces.
      use: (r.looksLikeComponent || weighed) && !existing ? { kind: 'undecided' } : { kind: 'sell' },
      target: existing ? { kind: 'existing', menuItemId: existing.id, mode: 'replace' } : { kind: 'new' },
      sellingPrice: null,
      lines: r.ingredients.map((ingredient, li): DraftLine => {
        const matched = ingredient.materialId ?? matchMaterialByName(ingredient.nameAsWritten, input.materials)?.id ?? null;
        return {
          key: `r${ri + 1}l${li + 1}`,
          ingredient,
          choice: matched ? { kind: 'existing', id: matched } : { kind: 'new', key: newKeyFor(ingredient) },
          answers: {},
        };
      }),
    };
  });
  return { recipes, newMaterials, moreNotRead: parsed.moreNotRead, fromPhotos: input.fromPhotos };
}

/** What a line's material is, for working it out: unit, price per unit, remembered weights, name. */
export interface LineMaterial { name: string; unit: string; costPerUnit?: number; gramsPerTsp?: number; gramsPerPiece?: number }

export function lineMaterial(draft: RecipeDraft, line: DraftLine, materials: DraftMaterial[]): LineMaterial | null {
  if (line.choice.kind === 'skip') return null;
  if (line.choice.kind === 'existing') {
    const id = line.choice.id;
    const m = materials.find(x => x.id === id);
    return m ? { name: m.name, unit: m.unit || 'g', costPerUnit: m.costPerUnit, gramsPerTsp: m.gramsPerTsp, gramsPerPiece: m.gramsPerPiece } : null;
  }
  const key = line.choice.key;
  const nm = draft.newMaterials.find(n => n.key === key);
  if (!nm) return null;
  return { name: nm.name, unit: nm.unit, ...(nm.pricePerBuyUnit && nm.pricePerBuyUnit > 0 && { costPerUnit: nm.pricePerBuyUnit / PER_BUY_UNIT[nm.unit] }) };
}

/**
 * Points a line at another material: an existing one, a new one already in the draft, a new one named after the
 * ingredient (`new_from_line`, made here), or none (left out). What was answered for the old material starts again.
 * Changes `draft` in place: callers pass a copy.
 */
export function chooseLineMaterial(draft: RecipeDraft, line: DraftLine, choice: LineChoice | { kind: 'new_from_line' }): void {
  line.answers = {};
  if (choice.kind !== 'new_from_line') { line.choice = choice; return; }
  const own = draft.newMaterials.find(n => squash(n.name) === squash(line.ingredient.nameAsWritten));
  if (own) { line.choice = { kind: 'new', key: own.key }; return; }
  const key = `n${draft.newMaterials.length + 1}`;
  draft.newMaterials.push({ key, name: capitalise(line.ingredient.nameAsWritten), unit: suggestMaterialUnit(line.ingredient), pricePerBuyUnit: null });
  line.choice = { kind: 'new', key };
}

/** How a line's question is put to the owner: the words, the unit of the answer, a typical value to offer, what an answer sets. */
export interface QuestionPrompt {
  prompt: string;
  unit: string;
  suggestion?: number;
  answer: (n: number) => LineAnswers;
  /** A pinch of something expensive can still be left out. */
  canLeaveOut: boolean;
}

export function questionPrompt(question: LineQuestion, line: DraftLine, materialName: string, recipeUnit: string): QuestionPrompt {
  switch (question.kind) {
    case 'measure_weight':
      return { prompt: `1 ${question.measure} of ${materialName} weighs`, unit: 'g', suggestion: question.suggestion, answer: n => ({ gramsPerMeasure: n }), canLeaveOut: false };
    case 'piece_weight':
      return { prompt: `One ${materialName} weighs`, unit: 'g', suggestion: question.suggestion, answer: n => ({ gramsPerPiece: n }), canLeaveOut: false };
    case 'household':
      return { prompt: `How much is ${line.ingredient.amountAsWritten ?? ''} ${question.measure}, for the whole batch?`.replace(/\s+/g, ' '), unit: recipeUnit, answer: n => ({ batchAmount: n }), canLeaveOut: false };
    case 'pinch':
      return { prompt: 'How much for the whole batch?', unit: recipeUnit, answer: n => ({ batchAmount: n }), canLeaveOut: true };
    default:
      return { prompt: 'How much for the whole batch?', unit: recipeUnit, answer: n => ({ batchAmount: n }), canLeaveOut: false };
  }
}

/** One line worked out for the whole batch, or what to ask; null when it is left out. */
export function resolveDraftLine(draft: RecipeDraft, recipe: DraftRecipe, line: DraftLine, materials: DraftMaterial[]): LineResolution | null {
  const material = lineMaterial(draft, line, materials);
  if (!material) return null;
  return resolveLine({
    ingredient: line.ingredient, materialUnit: material.unit, materialName: material.name,
    gramsPerTsp: material.gramsPerTsp, gramsPerPiece: material.gramsPerPiece, costPerUnit: material.costPerUnit,
    makes: recipe.use.kind === 'part' ? recipe.use.covers ?? undefined : recipe.makes ?? undefined,
    answers: line.answers,
  });
}

/**
 * How many of the item one batch is shared over: what it makes (a sold recipe, or one made ahead and kept), or for a
 * component mixed in, how many of its item it covers.
 */
export const batchShare = (recipe: DraftRecipe): number | null =>
  recipe.use.kind === 'part' ? recipe.use.covers : recipe.use.kind === 'sell' || recipe.use.kind === 'kept' ? recipe.makes : null;

/** The recipe or menu item a component is used in, when it is one that can be (a sold recipe here, or a menu item). */
function componentTarget(draft: RecipeDraft, menu: DraftMenuItem[], of: string | null): { name: string } | undefined {
  return of?.startsWith('recipe:') ? draft.recipes.find(x => `recipe:${x.key}` === of && x.include && x.use.kind === 'sell')
    : of?.startsWith('menu:') ? menu.find(m => `menu:${m.id}` === of) : undefined;
}

/** What one piece of a recipe made ahead and kept costs, when every line has a price (null otherwise, or with no batch size). */
export function keptPieceCost(draft: RecipeDraft, kept: DraftRecipe, materials: DraftMaterial[]): number | null {
  if (!(kept.makes! > 0)) return null;
  const costs = kept.lines.filter(l => l.choice.kind !== 'skip').map(l => lineCostPerItem(draft, kept, l, materials));
  return costs.some(c => c === null) ? null : costs.reduce((a: number, c) => a + c!, 0);
}

/**
 * The recipes made ahead and kept that go into `recipe` (a sold recipe on this page), with how many (in their unit: pieces,
 * or kg for one counted by weight) and what one piece (one kg) of each costs.
 */
export function keptPartsOf(draft: RecipeDraft, recipe: DraftRecipe, materials: DraftMaterial[]): { key: string; name: string; perItem: number; unit: ItemUnit; cost: number | null }[] {
  return draft.recipes
    .filter(k => k.include && k.use.kind === 'kept' && k.use.of === `recipe:${recipe.key}` && (k.use.perItem ?? 0) > 0)
    .map(k => ({ key: k.key, name: k.name.trim() || 'A base', perItem: (k.use as { perItem: number }).perItem, unit: itemUnit(k), cost: keptPieceCost(draft, k, materials) }));
}

/** The cost of a line for one item, when the line is worked out and its material has a price. */
export function lineCostPerItem(draft: RecipeDraft, recipe: DraftRecipe, line: DraftLine, materials: DraftMaterial[]): number | null {
  const r = resolveDraftLine(draft, recipe, line, materials);
  const share = batchShare(recipe);
  const material = lineMaterial(draft, line, materials);
  if (!r || r.status !== 'ok' || !share || !material || !(material.costPerUnit! > 0)) return null;
  return convertAmount(perItem(r.batchAmount, share), r.recipeUnit, material.unit) * material.costPerUnit!;
}

export interface DraftIssue { recipeKey?: string; lineKey?: string; message: string }

/** Everything still to settle before the draft can be saved. */
export function draftIssues(draft: RecipeDraft, materials: DraftMaterial[], menu: DraftMenuItem[]): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const included = draft.recipes.filter(r => r.include);
  if (included.length === 0) issues.push({ message: 'Tick at least one recipe to save.' });
  for (const r of included) {
    const label = r.name.trim() || 'A recipe';
    if (r.use.kind === 'undecided') issues.push({ recipeKey: r.key, message: `${label}: do you sell it, mix it into another item, or make it ahead and keep it?` });
    if (r.use.kind === 'sell') {
      if (r.target.kind === 'new' && !r.name.trim()) issues.push({ recipeKey: r.key, message: 'Give the recipe a name.' });
      if (recipeUnit(r, menu) !== 'pcs') {
        issues.push({ recipeKey: r.key, message: `${label}: selling by weight is not available yet. Say how many pieces one batch makes, or choose "Made ahead and kept" to keep it by weight.` });
      } else if (!(r.makes! > 0)) issues.push({ recipeKey: r.key, message: `${label}: how many does one batch make?` });
    }
    if (r.use.kind === 'part') {
      const target = componentTarget(draft, menu, r.use.of);
      if (!target) issues.push({ recipeKey: r.key, message: `${label}: which item is it part of?` });
      if (!(r.use.covers! > 0)) issues.push({ recipeKey: r.key, message: `${label}: how many does one batch cover?` });
    }
    if (r.use.kind === 'kept') {
      if (r.target.kind === 'new' && !r.name.trim()) issues.push({ recipeKey: r.key, message: 'Give the item made ahead a name.' });
      const unit = recipeUnit(r, menu);
      if (!(r.makes! > 0)) issues.push({ recipeKey: r.key, message: unit === 'pcs' ? `${label}: how many does one batch make?` : `${label}: how much does one batch make?` });
      if (r.use.of) {
        const target = componentTarget(draft, menu, r.use.of);
        if (!target) issues.push({ recipeKey: r.key, message: `${label}: which item is it used in?` });
        else if (!(r.use.perItem! > 0)) issues.push({ recipeKey: r.key, message: unit === 'pcs' ? `${label}: how many go into one ${target.name.trim() || 'item'}?` : `${label}: how much goes into one ${target.name.trim() || 'item'}?` });
      }
    }
    const kept = r.lines.filter(l => l.choice.kind !== 'skip');
    if (kept.length === 0) issues.push({ recipeKey: r.key, message: `${label}: every ingredient is left out.` });
    for (const l of kept) {
      const res = resolveDraftLine(draft, r, l, materials);
      if (!res) issues.push({ recipeKey: r.key, lineKey: l.key, message: `${label}: choose a material for ${l.ingredient.nameAsWritten}.` });
      else if (res.status === 'ask') issues.push({ recipeKey: r.key, lineKey: l.key, message: `${label}: ${l.ingredient.nameAsWritten} needs an answer.` });
    }
  }
  for (const nm of usedNewMaterials(draft)) {
    if (!nm.name.trim()) issues.push({ message: 'Give every new material a name.' });
  }
  return issues;
}

/** The new materials that an included line still uses. */
export function usedNewMaterials(draft: RecipeDraft): DraftNewMaterial[] {
  const used = new Set(draft.recipes.filter(r => r.include).flatMap(r => r.lines).map(l => (l.choice.kind === 'new' ? l.choice.key : null)).filter(Boolean));
  return draft.newMaterials.filter(n => used.has(n.key));
}

export type DraftImport = { items: RecipeImportItem[]; newMaterials: NewMaterialInput[]; remember: MaterialMemory[] };

/**
 * What to save, once `draftIssues` is empty. A component mixed in is folded into the item it is part of; one made ahead and
 * kept is its own item (not sold on the menu, with its batch size), linked as a part of the item it is used in.
 */
export function draftToImport(draft: RecipeDraft, materials: DraftMaterial[], menu: DraftMenuItem[]): DraftImport | null {
  if (draftIssues(draft, materials, menu).length > 0) return null;
  const remember = new Map<string, MaterialMemory>();
  const newMeta = new Map<string, { gramsPerTsp?: number; gramsPerPiece?: number }>();
  const linesOf = (r: DraftRecipe): RecipeImportLine[] => {
    const share = batchShare(r)!;
    const out: RecipeImportLine[] = [];
    for (const l of r.lines) {
      const res = resolveDraftLine(draft, r, l, materials);
      if (!res || res.status !== 'ok' || res.batchAmount <= 0 || l.choice.kind === 'skip') continue;
      if (res.remember) {
        if (l.choice.kind === 'existing') remember.set(l.choice.id, { ...remember.get(l.choice.id), materialId: l.choice.id, ...res.remember });
        else newMeta.set(l.choice.key, { ...newMeta.get(l.choice.key), ...res.remember });
      }
      out.push({
        material: l.choice.kind === 'existing' ? { existingId: l.choice.id } : { newKey: l.choice.key },
        amount: perItem(res.batchAmount, share), unit: res.recipeUnit,
      });
    }
    return out;
  };

  const included = draft.recipes.filter(r => r.include);
  const items: RecipeImportItem[] = [];
  const byRecipe = new Map<string, RecipeImportItem>();
  // Made ahead and kept first, so the items that use them can point at them.
  for (const r of included.filter(x => x.use.kind === 'kept')) {
    const item: RecipeImportItem = {
      key: `recipe:${r.key}`,
      target: r.target.kind === 'new' ? { kind: 'new', name: r.name.trim() } : { kind: 'existing', menuItemId: r.target.menuItemId, mode: r.target.mode },
      lines: linesOf(r),
      batchMakes: r.makes!,
      ...(r.target.kind === 'new' && { notForSale: true, ...(r.countedIn && { countedIn: r.countedIn }) }),
      ...(unitChange(r, menu) !== undefined && { countedIn: unitChange(r, menu) }),
    };
    items.push(item);
    byRecipe.set(`recipe:${r.key}`, item);
  }
  for (const r of included.filter(x => x.use.kind === 'sell')) {
    const item: RecipeImportItem = {
      target: r.target.kind === 'new'
        ? { kind: 'new', name: r.name.trim(), ...(r.sellingPrice && r.sellingPrice > 0 && { sellingPrice: r.sellingPrice }) }
        : { kind: 'existing', menuItemId: r.target.menuItemId, mode: r.target.mode },
      lines: linesOf(r),
      ...(r.makes && r.makes > 0 && { batchMakes: r.makes }),
      ...(r.madeToOrder && { madeToOrder: true }),
      // Sold, an item on the menu counted by weight is counted in pieces again (selling by weight comes later).
      ...(unitChange(r, menu) === null && { countedIn: null }),
    };
    items.push(item);
    byRecipe.set(`recipe:${r.key}`, item);
  }
  /** The item a component goes into: one saved here, or a menu item (added to, never replaced). */
  const intoItem = (of: string): RecipeImportItem => {
    const found = byRecipe.get(of) ?? items.find(i => i.target.kind === 'existing' && `menu:${i.target.menuItemId}` === of);
    if (found) return found;
    const item: RecipeImportItem = { target: { kind: 'existing', menuItemId: of.slice('menu:'.length), mode: 'add' }, lines: [] };
    items.push(item);
    return item;
  };
  for (const r of included.filter(x => x.use.kind === 'kept')) {
    const use = r.use as Extract<DraftUse, { kind: 'kept' }>;
    if (!use.of || !(use.perItem! > 0)) continue;
    const kept = byRecipe.get(`recipe:${r.key}`)!;
    const ref = kept.target.kind === 'existing' ? { existingId: kept.target.menuItemId } : { newKey: kept.key! };
    const into = intoItem(use.of);
    into.parts = [...(into.parts ?? []), { item: ref, quantity: use.perItem! }];
  }
  for (const r of included.filter(x => x.use.kind === 'part')) {
    const of = (r.use as Extract<DraftUse, { kind: 'part' }>).of!;
    intoItem(of).lines.push(...linesOf(r));
  }

  const newMaterials: NewMaterialInput[] = usedNewMaterials(draft).map(nm => ({
    key: nm.key, name: nm.name.trim(), unit: nm.unit,
    ...(nm.pricePerBuyUnit && nm.pricePerBuyUnit > 0 && { costPerUnit: nm.pricePerBuyUnit / PER_BUY_UNIT[nm.unit] }),
    ...newMeta.get(nm.key),
  }));
  return { items, newMaterials, remember: [...remember.values()] };
}
