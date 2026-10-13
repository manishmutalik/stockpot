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
 *  - A recipe the reader marked as a component (whipped cream, ganache) must be settled by the owner: sold on its own,
 *    or part of another item, with how many of that item one batch covers.
 *  - A recipe whose name is an existing menu item replaces that item's recipe unless the owner chooses otherwise.
 *  - Nothing can be saved while a question is open: `draftIssues` lists them.
 */
import type { MenuItem, RawMaterial } from '../types';
import { convertAmount } from './conversions';
import { matchMaterialByName, perItem, resolveLine, suggestMaterialUnit, type LineAnswers, type LineQuestion, type LineResolution } from './kitchenMeasures';
import { squash } from './orderParse';
import type { MaterialMemory, NewMaterialInput, RecipeImportItem, RecipeImportLine } from './plans/planRecipes';
import type { ParsedIngredient, ParsedRecipes } from './recipeParse';

/** What the draft needs of a material and a menu item (the phone has only these: quickApiTypes' RecipeSetupView). */
export type DraftMaterial = Pick<RawMaterial, 'id' | 'name' | 'unit'> & Partial<Pick<RawMaterial, 'costPerUnit' | 'gramsPerTsp' | 'gramsPerPiece'>>;
export type DraftMenuItem = Pick<MenuItem, 'id' | 'name'>;

export type LineChoice = { kind: 'existing'; id: string } | { kind: 'new'; key: string } | { kind: 'skip' };

export interface DraftLine {
  key: string;
  ingredient: ParsedIngredient;
  choice: LineChoice;
  answers: LineAnswers;
}

/** What a recipe is for. A component starts `undecided` until the owner says. `of` is `recipe:<key>` or `menu:<id>`. */
export type DraftUse = { kind: 'sell' } | { kind: 'part'; of: string | null; covers: number | null } | { kind: 'undecided' };
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
  lines: DraftLine[];
}

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
    return {
      key: `r${ri + 1}`,
      include: true,
      name: existing && !name ? existing.name : name,
      makes: r.makes ?? null,
      ...(r.makesAsWritten && { makesAsWritten: r.makesAsWritten }),
      looksLikeComponent: r.looksLikeComponent,
      looksCutOff: r.looksCutOff,
      ...(r.notes && { notes: r.notes }),
      use: r.looksLikeComponent && !existing ? { kind: 'undecided' } : { kind: 'sell' },
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

/** How many of the item one batch is shared over: what it makes, or for a component how many of its item it covers. */
export const batchShare = (recipe: DraftRecipe): number | null =>
  recipe.use.kind === 'part' ? recipe.use.covers : recipe.use.kind === 'sell' ? recipe.makes : null;

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
    if (r.use.kind === 'undecided') issues.push({ recipeKey: r.key, message: `${label}: do you sell it, or is it part of another item?` });
    if (r.use.kind === 'sell') {
      if (r.target.kind === 'new' && !r.name.trim()) issues.push({ recipeKey: r.key, message: 'Give the recipe a name.' });
      if (!(r.makes! > 0)) issues.push({ recipeKey: r.key, message: `${label}: how many does one batch make?` });
    }
    if (r.use.kind === 'part') {
      const of = r.use.of;
      const target = of?.startsWith('recipe:') ? draft.recipes.find(x => `recipe:${x.key}` === of && x.include && x.use.kind === 'sell')
        : of?.startsWith('menu:') ? menu.find(m => `menu:${m.id}` === of) : undefined;
      if (!target) issues.push({ recipeKey: r.key, message: `${label}: which item is it part of?` });
      if (!(r.use.covers! > 0)) issues.push({ recipeKey: r.key, message: `${label}: how many does one batch cover?` });
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

/** What to save, once `draftIssues` is empty. Components are folded into the item they are part of. */
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
  for (const r of included.filter(x => x.use.kind === 'sell')) {
    const item: RecipeImportItem = {
      target: r.target.kind === 'new'
        ? { kind: 'new', name: r.name.trim(), ...(r.sellingPrice && r.sellingPrice > 0 && { sellingPrice: r.sellingPrice }) }
        : { kind: 'existing', menuItemId: r.target.menuItemId, mode: r.target.mode },
      lines: linesOf(r),
    };
    items.push(item);
    byRecipe.set(`recipe:${r.key}`, item);
  }
  for (const r of included.filter(x => x.use.kind === 'part')) {
    const of = (r.use as Extract<DraftUse, { kind: 'part' }>).of!;
    const lines = linesOf(r);
    const into = byRecipe.get(of)
      ?? items.find(i => i.target.kind === 'existing' && `menu:${i.target.menuItemId}` === of);
    if (into) { into.lines.push(...lines); continue; }
    const item: RecipeImportItem = { target: { kind: 'existing', menuItemId: of.slice('menu:'.length), mode: 'add' }, lines };
    items.push(item);
  }

  const newMaterials: NewMaterialInput[] = usedNewMaterials(draft).map(nm => ({
    key: nm.key, name: nm.name.trim(), unit: nm.unit,
    ...(nm.pricePerBuyUnit && nm.pricePerBuyUnit > 0 && { costPerUnit: nm.pricePerBuyUnit / PER_BUY_UNIT[nm.unit] }),
    ...newMeta.get(nm.key),
  }));
  return { items, newMaterials, remember: [...remember.values()] };
}
