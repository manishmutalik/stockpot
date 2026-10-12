/**
 * recipeParse.ts
 *
 * Reading recipes from typed or pasted text, or from photos of a notebook page, a printed recipe or a screenshot,
 * shared by the server (to check what the model read) and the browser (to prepare the text and the photos). The
 * counterpart of orderParse.ts and productionParse.ts, with the same rules (docs/AI_CFO_DESIGN.md):
 *
 *  - The model only reads. Nothing is saved from it: the answer fills a check screen, the owner corrects it and
 *    presses Save.
 *  - A page can hold several recipes, so the answer is a list. A recipe that looks like part of another (whipped
 *    cream, ganache, custard) is marked, and the owner is asked whether they sell it or use it in something else.
 *  - The model copies what is written ("2 cups", "dedh katori", "a pinch") and its reading of the number and the
 *    unit. Turning a cup of maida into grams, and a batch into one item, is done by code (utils/kitchenMeasures),
 *    never by the model.
 *  - For text, every name, amount and unit must be text that is in the message, so nothing is made up. A photo cannot
 *    be checked that way, so the check screen shows the photo beside what was read and says to compare them.
 *  - An ingredient is only matched to a material that exists (an id from the list that was sent); otherwise it is
 *    shown as new, to be created when the owner saves.
 */
import { redactPhones } from './aiPrivacy';
import { squash } from './orderParse';

export const RECIPE_TEXT_MAX_CHARS = 6000;
export const RECIPE_MAX_RECIPES = 6;
export const RECIPE_MAX_INGREDIENTS = 40;
export const RECIPE_MAX_MATERIALS = 300;
export const RECIPE_MAX_PHOTOS = 3;
/** Each photo, as bytes once decoded. The browser and the phone shrink photos to well under this before sending. */
export const RECIPE_PHOTO_MAX_BYTES = 2_500_000;
export const RECIPE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type RecipePhotoType = typeof RECIPE_PHOTO_TYPES[number];
/** The longest side a photo is shrunk to before it is sent: enough to read handwriting, small enough to send on a phone. */
export const RECIPE_PHOTO_MAX_SIDE = 1600;
export const RECIPE_MAX_AMOUNT = 100000;
export const RECIPE_MAX_MAKES = 1000;

/** The units the model may give. Everything a kitchen writes maps to one of these; `other` is anything else, `none` is no unit ("2 eggs"). */
export const RECIPE_UNITS = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'piece', 'pinch', 'katori', 'glass', 'handful', 'other', 'none'] as const;
export type RecipeUnit = typeof RECIPE_UNITS[number];

/** What kind of ingredient it is, only so a spoon of a spice not in the weights table still gets a sensible weight. */
export const INGREDIENT_KINDS = ['ground_spice', 'whole_spice', 'dried_herb', 'paste', 'other'] as const;
export type IngredientKind = typeof INGREDIENT_KINDS[number];

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });

/** The JSON schema the model's answer must follow (structured outputs). Every field is present; "not written" is null. */
export const RECIPE_SCHEMA = {
  type: 'object',
  properties: {
    recipes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: nullable({ type: 'string' }),
          makesAsWritten: nullable({ type: 'string' }),
          makes: nullable({ type: 'number' }),
          looksLikeComponent: { type: 'boolean' },
          looksCutOff: { type: 'boolean' },
          notes: nullable({ type: 'string' }),
          ingredients: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                nameAsWritten: { type: 'string' },
                amountAsWritten: nullable({ type: 'string' }),
                amount: nullable({ type: 'number' }),
                unitAsWritten: nullable({ type: 'string' }),
                unit: { type: 'string', enum: [...RECIPE_UNITS] },
                kind: { type: 'string', enum: [...INGREDIENT_KINDS] },
                materialId: nullable({ type: 'string' }),
                unclear: { type: 'boolean' },
                note: nullable({ type: 'string' }),
              },
              required: ['nameAsWritten', 'amountAsWritten', 'amount', 'unitAsWritten', 'unit', 'kind', 'materialId', 'unclear', 'note'],
              additionalProperties: false,
            },
          },
        },
        required: ['name', 'makesAsWritten', 'makes', 'looksLikeComponent', 'looksCutOff', 'notes', 'ingredients'],
        additionalProperties: false,
      },
    },
    moreNotRead: { type: 'boolean' },
  },
  required: ['recipes', 'moreNotRead'],
  additionalProperties: false,
} as const;

export interface ParsedIngredient {
  nameAsWritten: string;
  /** The amount exactly as written ("2", "1 1/2", "dedh", "a"), when one is written. */
  amountAsWritten?: string;
  /** The model's reading of that amount; utils/kitchenMeasures reads `amountAsWritten` itself where it can. */
  amount?: number;
  unitAsWritten?: string;
  unit: RecipeUnit;
  kind: IngredientKind;
  /** A material id from the list that was sent, or null when the ingredient is not one of the owner's materials. */
  materialId: string | null;
  /** The handwriting or print was hard to read: the owner is asked to check this line. */
  unclear: boolean;
  /** How it is used, as written ("softened", "for the glaze"). */
  note?: string;
}

export interface ParsedRecipe {
  name?: string;
  makesAsWritten?: string;
  /** How many of the item one batch makes, when the recipe says. */
  makes?: number;
  /** Whipped cream, ganache, custard, a syrup: something usually used in another item. The owner is asked. */
  looksLikeComponent: boolean;
  /** The recipe seems to carry on past the edge of the page. */
  looksCutOff: boolean;
  /** Variations and remarks, as written ("for a chocolate version add 2 tbsp cocoa"). */
  notes?: string;
  ingredients: ParsedIngredient[];
}

export interface ParsedRecipes {
  recipes: ParsedRecipe[];
  /** There were more recipes than are read at once (RECIPE_MAX_RECIPES). */
  moreNotRead: boolean;
}

/** A photo as it is sent: the image's type and its bytes in base64. */
export interface RecipePhoto {
  mediaType: RecipePhotoType;
  data: string;
}

// ── Preparing the text ──────────────────────────────────────────────────────

/** The text as it is sent: whitespace tidied (lines kept, recipes are written in lines), phone numbers removed. */
export function prepareRecipeText(raw: string): string {
  const collapsed = raw.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  // Line by line: a number at the end of one line and an amount starting the next must not read as one phone number.
  return collapsed.split('\n').map(line => redactPhones(line, '[phone]').text).join('\n').slice(0, RECIPE_TEXT_MAX_CHARS);
}

// ── Checking a photo ─────────────────────────────────────────────────────────

/** How many bytes a base64 string decodes to. */
export const base64Bytes = (b64: string): number => {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
};

/** The first bytes each accepted type starts with, so a photo is what it says it is. */
function signatureMatches(mediaType: RecipePhotoType, b64: string): boolean {
  const head = b64.slice(0, 24);
  if (mediaType === 'image/jpeg') return head.startsWith('/9j/');
  if (mediaType === 'image/png') return head.startsWith('iVBORw0KGgo');
  // RIFF....WEBP
  return head.startsWith('UklGR') && b64.slice(8, 16).startsWith('V0VCU');
}

/** A photo from a request, checked: an accepted type, really that type, not too large. Null when it is none of these. */
export function checkRecipePhoto(v: unknown): RecipePhoto | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const { mediaType, data } = v as Record<string, unknown>;
  if (typeof mediaType !== 'string' || !(RECIPE_PHOTO_TYPES as readonly string[]).includes(mediaType)) return null;
  if (typeof data !== 'string' || data.length < 32 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return null;
  if (base64Bytes(data) > RECIPE_PHOTO_MAX_BYTES) return null;
  if (!signatureMatches(mediaType as RecipePhotoType, data)) return null;
  return { mediaType: mediaType as RecipePhotoType, data };
}

// ── Checking what the model read ─────────────────────────────────────────────

export type RecipeParseValidation = { ok: true; parsed: ParsedRecipes } | { ok: false; problems: string[] };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const orNull = (v: unknown) => (v === undefined || v === null || (typeof v === 'string' && v.trim() === '') ? null : v);

/**
 * Checks the model's reading. `text` is the text that was sent, or null when photos were sent: then nothing can be
 * checked against what is written, only the shape, the ids and the numbers.
 */
export function validateParsedRecipes(raw: unknown, input: { text: string | null; materialIds: Iterable<string> }): RecipeParseValidation {
  if (!isObject(raw)) return { ok: false, problems: ['the answer is not an object'] };
  const problems: string[] = [];
  const materialIds = new Set(input.materialIds);
  const haystack = input.text === null ? null : squash(input.text);
  // With photos there is no text to check against; every string is accepted as read.
  const written = (s: string) => haystack === null || (squash(s) !== '' && haystack.includes(squash(s)));
  const str = (v: unknown, max: number): string | null | undefined => {
    const x = orNull(v);
    if (x === null) return null;
    return typeof x === 'string' && x.trim().length <= max ? x.trim() : undefined;
  };

  if (!Array.isArray(raw.recipes)) return { ok: false, problems: ['recipes is not a list'] };
  if (raw.recipes.length > RECIPE_MAX_RECIPES) return { ok: false, problems: [`more than ${RECIPE_MAX_RECIPES} recipes (read the first ${RECIPE_MAX_RECIPES} and set moreNotRead)`] };

  const recipes: ParsedRecipe[] = [];
  raw.recipes.forEach((r: unknown, ri: number) => {
    const rn = `recipe ${ri + 1}`;
    if (!isObject(r)) { problems.push(`${rn} is malformed`); return; }
    const recipe: ParsedRecipe = { looksLikeComponent: r.looksLikeComponent === true, looksCutOff: r.looksCutOff === true, ingredients: [] };

    const name = str(r.name, 80);
    if (name === undefined) problems.push(`${rn}: name is malformed`);
    else if (name !== null) { if (written(name)) recipe.name = name; else problems.push(`${rn}: the name "${name}" is not written in the text`); }

    const makesAsWritten = str(r.makesAsWritten, 60);
    if (makesAsWritten === undefined) problems.push(`${rn}: makesAsWritten is malformed`);
    else if (makesAsWritten !== null) { if (written(makesAsWritten)) recipe.makesAsWritten = makesAsWritten; else problems.push(`${rn}: "${makesAsWritten}" is not written in the text`); }
    const makes = orNull(r.makes);
    if (makes !== null) {
      if (typeof makes !== 'number' || !(makes > 0) || makes > RECIPE_MAX_MAKES) problems.push(`${rn}: makes must be a number above 0 and at most ${RECIPE_MAX_MAKES}, or null`);
      else if (recipe.makesAsWritten === undefined) problems.push(`${rn}: makes is given but makesAsWritten is not (copy the words that say how many it makes)`);
      // A batch makes a whole number of items; anything else ("1.5 kg") is left for the owner to answer.
      else if (Number.isInteger(makes)) recipe.makes = makes;
    }

    const notes = str(r.notes, 300);
    if (notes === undefined) problems.push(`${rn}: notes is malformed`);
    else if (notes !== null) recipe.notes = notes;

    if (!Array.isArray(r.ingredients)) { problems.push(`${rn}: ingredients is not a list`); return; }
    if (r.ingredients.length > RECIPE_MAX_INGREDIENTS) { problems.push(`${rn}: more than ${RECIPE_MAX_INGREDIENTS} ingredients`); return; }
    r.ingredients.forEach((li: unknown, ii: number) => {
      const n = `${rn}, ingredient ${ii + 1}`;
      if (!isObject(li)) { problems.push(`${n} is malformed`); return; }
      const nameAsWritten = str(li.nameAsWritten, 80);
      if (!nameAsWritten) { problems.push(`${n}: nameAsWritten is missing or malformed`); return; }
      let ok = true;
      if (!written(nameAsWritten)) { problems.push(`${n}: "${nameAsWritten}" is not written in the text`); ok = false; }
      const amountAsWritten = str(li.amountAsWritten, 30);
      if (amountAsWritten === undefined) { problems.push(`${n}: amountAsWritten is malformed`); ok = false; }
      else if (amountAsWritten !== null && !written(amountAsWritten)) { problems.push(`${n}: the amount "${amountAsWritten}" is not written in the text`); ok = false; }
      const amount = orNull(li.amount);
      if (amount !== null && (typeof amount !== 'number' || !(amount > 0) || amount > RECIPE_MAX_AMOUNT)) { problems.push(`${n}: amount must be a number above 0, or null`); ok = false; }
      if (amount !== null && amountAsWritten === null) { problems.push(`${n}: amount is given but amountAsWritten is not (copy the amount as written)`); ok = false; }
      const unitAsWritten = str(li.unitAsWritten, 30);
      if (unitAsWritten === undefined) { problems.push(`${n}: unitAsWritten is malformed`); ok = false; }
      else if (unitAsWritten !== null && !written(unitAsWritten)) { problems.push(`${n}: the unit "${unitAsWritten}" is not written in the text`); ok = false; }
      if (!(RECIPE_UNITS as readonly unknown[]).includes(li.unit)) { problems.push(`${n}: unit is not one of ${RECIPE_UNITS.join(', ')}`); ok = false; }
      const kind = (INGREDIENT_KINDS as readonly unknown[]).includes(li.kind) ? li.kind as IngredientKind : 'other';
      const id = orNull(li.materialId);
      if (id !== null && (typeof id !== 'string' || !materialIds.has(id))) { problems.push(`${n}: materialId is not one of the materials`); ok = false; }
      const note = str(li.note, 120);
      if (!ok) return;
      recipe.ingredients.push({
        nameAsWritten,
        ...(amountAsWritten !== null && { amountAsWritten }),
        ...(amount !== null && { amount: amount as number }),
        ...(unitAsWritten !== null && { unitAsWritten }),
        unit: li.unit as RecipeUnit,
        kind,
        materialId: id as string | null,
        unclear: li.unclear === true,
        ...(note && { note }),
      });
    });
    if (recipe.ingredients.length === 0 && r.ingredients.length === 0) return; // a heading with nothing under it
    recipes.push(recipe);
  });

  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, parsed: { recipes, moreNotRead: raw.moreNotRead === true } };
}
