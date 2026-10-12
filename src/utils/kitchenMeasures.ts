/**
 * kitchenMeasures.ts
 *
 * Turning a recipe line as a kitchen writes it ("2 cups maida", "dedh chammach haldi", "4 elaichi", "a pinch of
 * kesar") into an amount of one of the owner's materials, for one item of what the recipe makes. Pure, so it is
 * tested, and the same on the web and the phone. Used by the recipe reader (utils/recipeParse); the model only
 * copies what is written, every number here is worked out by code.
 *
 * The rules:
 *  - Spoons and cups are volumes (tsp 5 ml, tbsp 15 ml, cup 240 ml). For a material kept in ml or l that is the
 *    answer. For one kept by weight, a cup of maida is not 240 g (it is about 125 g), so it is weighed with the
 *    material's own grams-per-teaspoon when the owner has confirmed one, otherwise with the typical weight in
 *    `TYPICAL_WEIGHTS`, and only when that guess cannot matter much: a line that costs more than
 *    `ASK_ABOVE_COST_PER_ITEM` per item on a typical weight is asked about, with the typical weight as the
 *    suggestion (a cup of butter, a spoon of kesar).
 *  - Household measures (a katori, a glass, a handful) differ from home to home and are always asked about.
 *  - "A pinch" or "to taste" of something cheap is left out by default; of something expensive it is asked about.
 *  - Pieces ("4 elaichi") of something kept by weight are asked about once, then remembered on the material.
 *  - A recipe is written for a batch ("makes 12"); the app keeps recipes per item sold, so every amount is divided
 *    by how many the batch makes.
 */
import { convertAmount } from './conversions';
import { squash } from './orderParse';
import type { ParsedIngredient, RecipeUnit } from './recipeParse';

export const ML_PER = { tsp: 5, tbsp: 15, cup: 240 } as const;
export const TSP_PER = { tsp: 1, tbsp: 3, cup: 48 } as const;
export type SpoonMeasure = keyof typeof ML_PER;

/** A line whose guessed weight would cost more than this per item sold is asked about rather than guessed. */
export const ASK_ABOVE_COST_PER_ITEM = 3;
/** Something dearer than this per gram ("a pinch of kesar") is asked about rather than left out. */
export const EXPENSIVE_PER_GRAM = 20;

// ── Amounts as written ───────────────────────────────────────────────────────

const VULGAR: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
const WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  half: 0.5, quarter: 0.25, dozen: 12,
  // Hindi, as it is written in Latin letters
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, aadha: 0.5, adha: 0.5, aadhi: 0.5, adhi: 0.5, aadhe: 0.5,
  pav: 0.25, paav: 0.25, dedh: 1.5, derh: 1.5, dhai: 2.5, dhaai: 2.5, adhai: 2.5, adhaai: 2.5,
};

/**
 * The amount an "as written" text means: "2", "2.5", "1/2", "1 1/2", "1½", "½", "two", "half", "dedh", "sava 2",
 * "paune 2". Null for anything else, including a range ("2-3"), which the owner is asked to settle.
 */
export function parseAmount(asWritten: string | undefined): number | null {
  if (!asWritten) return null;
  let s = asWritten.toLowerCase().trim().replace(/,/g, '');
  for (const [glyph, value] of Object.entries(VULGAR)) s = s.replace(new RegExp(`(\\d)\\s*${glyph}`), `$1 ${value}`).replace(glyph, ` ${value}`);
  s = s.replace(/\s+/g, ' ').trim();
  if (/\d\s*(-|–|to)\s*\d/.test(s)) return null;
  // sava (a quarter more), paune (a quarter less): "sava 2" is 2.25, "paune 2" is 1.75
  const sava = s.match(/^(sava|sawa)\s+(.+)$/);
  if (sava) { const base = parseAmount(sava[2]); return base === null ? 1.25 : base + 0.25; }
  const paune = s.match(/^(paune|pone)\s+(.+)$/);
  if (paune) { const base = parseAmount(paune[2]); return base === null || base <= 0.25 ? null : base - 0.25; }
  if (s === 'sava' || s === 'sawa') return 1.25;
  let total = 0;
  let any = false;
  for (const part of s.split(' ')) {
    if (part === '' || part === 'and') continue;
    const frac = part.match(/^(\d+)\/(\d+)$/);
    if (frac) { const d = Number(frac[2]); if (!d) return null; total += Number(frac[1]) / d; any = true; continue; }
    if (/^\d+(\.\d+)?$/.test(part) || /^0?\.\d+$/.test(part)) { total += Number(part); any = true; continue; }
    if (part in WORDS) { total = part === 'dozen' && any ? total * 12 : total + WORDS[part]; any = true; continue; }
    return null;
  }
  return any && total > 0 ? Math.round(total * 10000) / 10000 : null;
}

/** "Heaped" (bhara hua) spoons hold about half as much again as level ones. */
export function heapedFactor(...written: (string | undefined)[]): number {
  return written.some(w => !!w && /\b(heap(ed|ing)?|bhar(a|i|e)?|bhar\s*ke|rounded)\b/i.test(w)) ? 1.5 : 1;
}

// ── Typical weights and names ────────────────────────────────────────────────

export interface TypicalWeight {
  /** Names it goes by, in English and Hindi (Latin letters and Devanagari). The longest one found wins. */
  names: string[];
  /** Grams in one level teaspoon (a tablespoon is 3, a cup 48). */
  gramsPerTsp?: number;
  /** Grams in one piece, for things counted ("2 eggs"). */
  gramsPerPiece?: number;
  /** Bought and kept by volume: a new material of this kind is suggested in ml. */
  liquid?: boolean;
  /** So dear that even a pinch is asked about. */
  dear?: boolean;
}

/**
 * Typical weights of a level teaspoon, from common household-measure tables (a cup is 48 teaspoons, so maida is about
 * 125 g a cup and sugar about 200 g). They are a starting point, shown to the owner and changeable: the answer is
 * remembered on the material. Ground spices weigh 2 to 3 g a teaspoon, so even a third off moves an item's cost by paise.
 */
export const TYPICAL_WEIGHTS: TypicalWeight[] = [
  // Flours and grains
  { names: ['maida', 'all purpose flour', 'all-purpose flour', 'plain flour', 'refined flour', 'apf', 'मैदा'], gramsPerTsp: 2.6 },
  { names: ['atta', 'whole wheat flour', 'wheat flour', 'gehun ka atta', 'आटा'], gramsPerTsp: 2.5 },
  { names: ['cornflour', 'corn flour', 'cornstarch', 'corn starch'], gramsPerTsp: 2.7 },
  { names: ['besan', 'gram flour', 'chickpea flour', 'बेसन'], gramsPerTsp: 1.9 },
  { names: ['rice flour', 'chawal ka atta'], gramsPerTsp: 3.3 },
  { names: ['sooji', 'suji', 'semolina', 'rava', 'rawa', 'सूजी'], gramsPerTsp: 3.5 },
  { names: ['oats', 'rolled oats'], gramsPerTsp: 1.9 },
  { names: ['desiccated coconut', 'coconut powder'], gramsPerTsp: 1.7 },
  // Sugars
  { names: ['sugar', 'chini', 'cheeni', 'caster sugar', 'granulated sugar', 'चीनी'], gramsPerTsp: 4.2 },
  { names: ['icing sugar', 'powdered sugar', 'confectioners sugar', 'pisi chini'], gramsPerTsp: 2.5 },
  { names: ['brown sugar'], gramsPerTsp: 4.6 },
  { names: ['honey', 'shahad'], gramsPerTsp: 7.1 },
  { names: ['condensed milk', 'milkmaid'], gramsPerTsp: 6.4 },
  // Fats and dairy
  { names: ['butter', 'makhan', 'makkhan', 'मक्खन'], gramsPerTsp: 4.7 },
  { names: ['ghee', 'घी'], gramsPerTsp: 4.5 },
  { names: ['oil', 'vegetable oil', 'refined oil', 'sunflower oil', 'tel'], gramsPerTsp: 4.5, liquid: true },
  { names: ['milk', 'doodh', 'दूध'], gramsPerTsp: 5.1, liquid: true },
  { names: ['curd', 'dahi', 'yogurt', 'yoghurt', 'दही'], gramsPerTsp: 5.1 },
  { names: ['cream', 'fresh cream', 'whipping cream', 'malai'], gramsPerTsp: 5.0, liquid: true },
  { names: ['water', 'paani', 'pani'], gramsPerTsp: 5.0, liquid: true },
  { names: ['vanilla essence', 'vanilla extract'], gramsPerTsp: 4.3, liquid: true },
  { names: ['rose water', 'gulab jal'], gramsPerTsp: 5.0, liquid: true },
  // Baking
  { names: ['cocoa', 'cocoa powder'], gramsPerTsp: 1.8 },
  { names: ['baking powder'], gramsPerTsp: 4.6 },
  { names: ['baking soda', 'soda bicarbonate', 'bicarbonate of soda', 'meetha soda', 'cooking soda'], gramsPerTsp: 4.6 },
  { names: ['yeast', 'instant yeast', 'dry yeast'], gramsPerTsp: 3.1 },
  { names: ['salt', 'namak', 'नमक'], gramsPerTsp: 6.0 },
  { names: ['chocolate chips', 'choco chips'], gramsPerTsp: 3.5 },
  // Ground spices
  { names: ['turmeric', 'haldi', 'हल्दी'], gramsPerTsp: 3.0 },
  { names: ['cumin powder', 'jeera powder', 'ground cumin'], gramsPerTsp: 2.1 },
  { names: ['coriander powder', 'dhania powder', 'dhaniya powder', 'ground coriander'], gramsPerTsp: 1.8 },
  { names: ['garam masala', 'गरम मसाला'], gramsPerTsp: 2.0 },
  { names: ['red chilli powder', 'chilli powder', 'lal mirch', 'kashmiri chilli powder', 'kashmiri mirch'], gramsPerTsp: 2.7 },
  { names: ['cinnamon', 'cinnamon powder', 'dalchini'], gramsPerTsp: 2.6 },
  { names: ['cardamom powder', 'elaichi powder'], gramsPerTsp: 2.0 },
  { names: ['black pepper', 'pepper powder', 'kali mirch'], gramsPerTsp: 2.3 },
  { names: ['ginger powder', 'dry ginger', 'saunth', 'sonth'], gramsPerTsp: 1.8 },
  { names: ['nutmeg', 'jaiphal'], gramsPerTsp: 2.2 },
  { names: ['chaat masala'], gramsPerTsp: 2.5 },
  { names: ['amchur', 'dry mango powder'], gramsPerTsp: 2.0 },
  // Whole spices and seeds
  { names: ['cumin seeds', 'jeera', 'जीरा'], gramsPerTsp: 2.1 },
  { names: ['fennel', 'fennel seeds', 'saunf'], gramsPerTsp: 2.0 },
  { names: ['mustard seeds', 'rai', 'sarson'], gramsPerTsp: 3.3 },
  { names: ['ajwain', 'carom seeds'], gramsPerTsp: 2.0 },
  { names: ['sesame', 'sesame seeds', 'til'], gramsPerTsp: 3.0 },
  { names: ['poppy seeds', 'khus khus', 'khaskhas'], gramsPerTsp: 2.8 },
  { names: ['fenugreek seeds', 'methi seeds', 'methi dana'], gramsPerTsp: 3.7 },
  // Herbs and pastes
  { names: ['kasuri methi', 'dried fenugreek leaves'], gramsPerTsp: 0.6 },
  { names: ['oregano', 'mixed herbs', 'italian seasoning'], gramsPerTsp: 1.0 },
  { names: ['chilli flakes', 'red chilli flakes'], gramsPerTsp: 1.8 },
  { names: ['ginger garlic paste', 'ginger-garlic paste', 'ginger paste', 'garlic paste', 'adrak lehsun paste'], gramsPerTsp: 5.0 },
  // Counted
  { names: ['egg', 'eggs', 'anda', 'ande', 'अंडा'], gramsPerPiece: 50 },
  { names: ['cardamom', 'elaichi', 'cardamom pods'] },
  { names: ['saffron', 'kesar', 'केसर'], dear: true },
];

/** When a spice is not in the table, its kind still gives a sensible weight. */
const KIND_GRAMS_PER_TSP: Partial<Record<ParsedIngredient['kind'], number>> = { ground_spice: 2.3, whole_spice: 2.5, dried_herb: 0.8, paste: 5.0 };

/** Names compared as whole words, ignoring case and punctuation. */
const words = (s: string) => ` ${squash(s)} `;

/** The table entry a name belongs to: the longest name in the table found in it as whole words. */
export function typicalWeightFor(name: string): TypicalWeight | null {
  const hay = words(name);
  let best: { entry: TypicalWeight; length: number } | null = null;
  for (const entry of TYPICAL_WEIGHTS) {
    for (const n of entry.names) {
      const needle = words(n);
      if (hay.includes(needle) && (!best || needle.length > best.length)) best = { entry, length: needle.length };
    }
  }
  return best?.entry ?? null;
}

/**
 * The owner's material an ingredient most likely is, by name, when the model found none: the same table entry
 * ("chini" and "Sugar", "makhan" and "Unsalted Butter"), or the same name. Never a different entry ("chini" is not
 * "Icing Sugar"), and never when two materials fit equally (then the owner chooses).
 */
export function matchMaterialByName<M extends { id: string; name: string }>(nameAsWritten: string, materials: M[]): M | null {
  const target = squash(nameAsWritten);
  const exact = materials.filter(m => squash(m.name) === target);
  if (exact.length === 1) return exact[0];
  const entry = typicalWeightFor(nameAsWritten);
  if (!entry) return null;
  const same = materials.filter(m => typicalWeightFor(m.name) === entry);
  return same.length === 1 ? same[0] : null;
}

// ── One line of a recipe ─────────────────────────────────────────────────────

/** What the owner is asked about a line before it can be saved. */
export type LineQuestion =
  /** No amount was written, or a range ("2-3"): how much, in the recipe unit. */
  | { kind: 'amount' }
  /** How many grams one cup/tbsp/tsp of it weighs. `suggestion` is the typical weight of one such measure. */
  | { kind: 'measure_weight'; measure: SpoonMeasure; suggestion?: number }
  /** How many grams one piece weighs. */
  | { kind: 'piece_weight'; suggestion?: number }
  /** How much one katori/glass/handful is, in the recipe unit. */
  | { kind: 'household'; measure: string }
  /** A pinch or "to taste" of something expensive: how much, in the recipe unit. */
  | { kind: 'pinch' };

/** What the owner has answered, or confirmed, for a line. */
export interface LineAnswers {
  /** The amount for the whole batch, in the recipe unit (answers `amount`, `household` and `pinch`). */
  batchAmount?: number;
  /** Grams in one of the measure the line uses (answers `measure_weight`); stored as grams per teaspoon. */
  gramsPerMeasure?: number;
  /** Grams in one piece (answers `piece_weight`). */
  gramsPerPiece?: number;
  /** Leave a pinch out. */
  skip?: boolean;
}

export interface LineInput {
  ingredient: ParsedIngredient;
  /** The unit of the material it is (or will be, for a new one): g, kg, ml, l, pcs or the owner's own. */
  materialUnit: string;
  /** The material's name, for the typical-weight table (the written name is used too). */
  materialName?: string;
  /** What the owner has confirmed before, on the material. */
  gramsPerTsp?: number;
  gramsPerPiece?: number;
  /** The material's cost per its own unit, when it has a price. */
  costPerUnit?: number;
  /** How many items the batch makes, when known (used for the cost rule; 1 when not known yet). */
  makes?: number;
  answers?: LineAnswers;
}

export type LineResolution =
  | {
      status: 'ok';
      /** The amount for the whole batch, in `recipeUnit`. Zero when a pinch is left out. */
      batchAmount: number;
      /** The unit the recipe line is kept in: g for a material kept by weight, ml by volume, otherwise its own. */
      recipeUnit: string;
      /** How it was worked out, for the check screen ("1 cup ≈ 125 g, typical"). */
      basis?: string;
      /** The weight used was the table's, not one the owner confirmed. */
      typical?: boolean;
      /** Remember on the material: what the owner just confirmed. */
      remember?: { gramsPerTsp?: number; gramsPerPiece?: number };
      skipped?: boolean;
    }
  | { status: 'ask'; question: LineQuestion; recipeUnit: string };

/** The unit a recipe line is kept in for a material kept in `materialUnit` (as the recipe editor does). */
export function recipeUnitFor(materialUnit: string): string {
  const u = (materialUnit || 'g').toLowerCase();
  if (u === 'kg' || u === 'g') return 'g';
  if (u === 'l' || u === 'ml') return 'ml';
  return u;
}

/** The unit a new material for this ingredient is suggested in. */
export function suggestMaterialUnit(ingredient: ParsedIngredient): 'g' | 'ml' | 'pcs' {
  if (ingredient.unit === 'ml' || ingredient.unit === 'l') return 'ml';
  if (ingredient.unit === 'g' || ingredient.unit === 'kg') return 'g';
  const entry = typicalWeightFor(ingredient.nameAsWritten);
  if (ingredient.unit === 'piece' || ingredient.unit === 'none') return entry?.gramsPerTsp ? 'g' : 'pcs';
  return entry?.liquid ? 'ml' : 'g';
}

const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;
const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-IN');

/** Cost per gram of a material kept by weight or volume (1 g = 1 ml), when it has a price. */
function costPerGram(input: LineInput): number | null {
  if (!(input.costPerUnit! > 0)) return null;
  const u = input.materialUnit.toLowerCase();
  if (!['g', 'kg', 'ml', 'l'].includes(u)) return null;
  return input.costPerUnit! / convertAmount(1, u, 'g');
}

/**
 * Works out one line for the whole batch, in the recipe unit, or says what to ask. Dividing by how many the batch
 * makes is `perItem`, done once the owner has settled "makes".
 */
export function resolveLine(input: LineInput): LineResolution {
  const { ingredient, answers = {} } = input;
  const recipeUnit = recipeUnitFor(input.materialUnit);
  const byWeight = recipeUnit === 'g';
  const byVolume = recipeUnit === 'ml';
  const unit: RecipeUnit = ingredient.unit;
  // A range ("2-3") is the owner's call; anything else code cannot read falls back to the model's reading of it.
  const isRange = /\d\s*(-|–|to)\s*\d/i.test(ingredient.amountAsWritten ?? '');
  const amount = isRange ? null : parseAmount(ingredient.amountAsWritten) ?? ingredient.amount ?? null;
  const names = [input.materialName, ingredient.nameAsWritten].filter(Boolean) as string[];
  const entry = names.map(typicalWeightFor).find(Boolean) ?? null;
  const ask = (question: LineQuestion): LineResolution => ({ status: 'ask', question, recipeUnit });
  const ok = (batchAmount: number, extra: Omit<Extract<LineResolution, { status: 'ok' }>, 'status' | 'batchAmount' | 'recipeUnit'> = {}): LineResolution =>
    ({ status: 'ok', batchAmount: round(batchAmount), recipeUnit, ...extra });
  const makes = input.makes && input.makes > 0 ? input.makes : 1;
  const perGram = costPerGram(input);

  // A pinch, or "to taste": left out unless it is expensive.
  if (unit === 'pinch' || (amount === null && /\b(to taste|as needed|as required|swad anusar)\b/i.test(`${ingredient.amountAsWritten ?? ''} ${ingredient.unitAsWritten ?? ''} ${ingredient.note ?? ''}`))) {
    if (answers.batchAmount !== undefined && answers.batchAmount > 0) return ok(answers.batchAmount);
    if (answers.skip) return ok(0, { skipped: true });
    const dear = (perGram !== null && perGram > EXPENSIVE_PER_GRAM) || entry?.dear === true;
    return dear ? ask({ kind: 'pinch' }) : ok(0, { skipped: true, basis: 'Tiny amount, left out' });
  }

  // Anything the owner settled directly wins.
  if (answers.batchAmount !== undefined && answers.batchAmount > 0) return ok(answers.batchAmount);
  if (amount === null) return ask({ kind: 'amount' });

  // Weights and volumes as written.
  if (unit === 'g' || unit === 'kg' || unit === 'ml' || unit === 'l') {
    if (!byWeight && !byVolume) return ask({ kind: 'amount' }); // grams of something kept in pieces
    return ok(convertAmount(amount, unit, recipeUnit));
  }

  // Household measures: always asked.
  if (unit === 'katori' || unit === 'glass' || unit === 'handful' || unit === 'other') {
    return ask({ kind: 'household', measure: ingredient.unitAsWritten || unit });
  }

  // Spoons and cups.
  if (unit === 'tsp' || unit === 'tbsp' || unit === 'cup') {
    const heaped = heapedFactor(ingredient.amountAsWritten, ingredient.unitAsWritten);
    const measures = amount * heaped;
    if (byVolume) return ok(measures * ML_PER[unit], { basis: `1 ${unit} = ${ML_PER[unit]} ml${heaped > 1 ? ', heaped' : ''}` });
    if (!byWeight) return ask({ kind: 'amount' });
    if (answers.gramsPerMeasure !== undefined && answers.gramsPerMeasure > 0) {
      return ok(measures * answers.gramsPerMeasure, { remember: { gramsPerTsp: round(answers.gramsPerMeasure / TSP_PER[unit], 3) } });
    }
    if (input.gramsPerTsp && input.gramsPerTsp > 0) {
      const g = input.gramsPerTsp * TSP_PER[unit];
      return ok(measures * g, { basis: `1 ${unit} ≈ ${fmt(g)} g${heaped > 1 ? ', heaped' : ''}` });
    }
    const typicalTsp = entry?.gramsPerTsp ?? KIND_GRAMS_PER_TSP[ingredient.kind];
    if (!typicalTsp) return ask({ kind: 'measure_weight', measure: unit });
    const g = typicalTsp * TSP_PER[unit];
    const batchGrams = measures * g;
    // A typical weight is a guess: fine for a spoon of haldi, asked about for a cup of butter.
    if (perGram !== null && (batchGrams * perGram) / makes > ASK_ABOVE_COST_PER_ITEM) return ask({ kind: 'measure_weight', measure: unit, suggestion: round(g, 1) });
    return ok(batchGrams, { typical: true, basis: `1 ${unit} ≈ ${fmt(g)} g, typical${heaped > 1 ? ', heaped' : ''}` });
  }

  // Pieces, or a bare count ("2 eggs").
  if (recipeUnit === 'pcs') return ok(amount);
  if (!byWeight && !byVolume) return ok(amount); // the owner's own unit: taken as written
  if (answers.gramsPerPiece !== undefined && answers.gramsPerPiece > 0) {
    return ok(amount * answers.gramsPerPiece, { remember: { gramsPerPiece: round(answers.gramsPerPiece, 3) } });
  }
  if (input.gramsPerPiece && input.gramsPerPiece > 0) return ok(amount * input.gramsPerPiece, { basis: `1 piece ≈ ${fmt(input.gramsPerPiece)} g` });
  return ask({ kind: 'piece_weight', ...(entry?.gramsPerPiece && { suggestion: entry.gramsPerPiece }) });
}

/** One item's share of a batch amount. */
export const perItem = (batchAmount: number, makes: number): number => round(batchAmount / makes);
