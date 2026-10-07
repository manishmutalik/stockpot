/**
 * menuVariants.ts
 *
 * Which menu item the words someone said mean, when the menu has several of the same thing in different sizes ("Pumpkin Seed
 * Bread 350g" and "Pumpkin Seed Bread 500g"). The model's pick is not enough: it will quietly take one of them. So the words
 * decide, in code:
 *  - the item's own name (without sizes) is compared with the words (without sizes);
 *  - a size that is written picks the item: a weight ("500gm"), a word the item's name has ("large"), or a word that means
 *    the biggest or smallest of them ("large" is the heaviest, "small" the lightest), when every one of them has a weight;
 *  - if the words do not choose, the answer is to ask, with every one that fits as an option. Never to pick one.
 * Nothing here names an item the words do not contain, and it is only used where the owner is asked to confirm.
 */

export interface MenuNamed { id: string; name: string }

export type MenuResolution =
  /** Nothing to add: use the model's pick, or treat the item as not found, as before. */
  | { kind: 'keep' }
  /** The words pin exactly one item. */
  | { kind: 'item'; id: string }
  /** Several fit and the words do not choose: ask, with these as the options. */
  | { kind: 'ask'; options: MenuNamed[] };

type Dimension = 'weight' | 'volume' | 'length';
interface Measure { dimension: Dimension; amount: number }

const LARGE_WORDS = ['large', 'larger', 'big', 'bigger', 'biggest', 'largest', 'xl', 'xxl', 'jumbo'];
const SMALL_WORDS = ['small', 'smaller', 'smallest', 'mini', 'little', 'tiny'];
const MIDDLE_WORDS = ['medium', 'regular'];
const SIZE_WORDS = new Set([...LARGE_WORDS, ...SMALL_WORDS, ...MIDDLE_WORDS]);
const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'dozen', 'half'];
const FILLER = new Set(['a', 'an', 'the', 'of', 'loaf', 'loaves', 'piece', 'pieces', 'pc', 'pcs', 'pack', 'packet', 'size', 'sized', ...NUMBER_WORDS]);

/** The most options one question offers. */
export const MAX_VARIANT_OPTIONS = 8;
/** When nothing is an exact match, more than this many that merely contain the words is too loose to ask about. */
const MAX_LOOSE_CANDIDATES = 6;

const MEASURE = /(\d+(?:\.\d+)?)\s*(kilograms?|kilogrammes?|kilos?|kgs?|grams?|grammes?|gms?|gm|g|millilit(?:re|er)s?|mls?|lit(?:re|er)s?|ltrs?|l|inch(?:es)?)(?![a-z])/gi;

function unitDimension(unit: string): { dimension: Dimension; factor: number } {
  const u = unit.toLowerCase();
  if (/^(kilo|kg)/.test(u)) return { dimension: 'weight', factor: 1000 };
  if (/^(gram|gm|g$)/.test(u)) return { dimension: 'weight', factor: 1 };
  if (/^(milli|ml)/.test(u)) return { dimension: 'volume', factor: 1 };
  if (/^(lit|ltr|l$)/.test(u)) return { dimension: 'volume', factor: 1000 };
  return { dimension: 'length', factor: 1 };
}

/** The first weight, volume or length written in the text, in grams, millilitres or inches. */
export function measureOf(text: string): Measure | null {
  for (const m of text.matchAll(MEASURE)) {
    const { dimension, factor } = unitDimension(m[2]);
    return { dimension, amount: Number(m[1]) * factor };
  }
  return null;
}

const tidy = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();

/** Singular and plural come to the same word: brownie and brownies, berry and berries, breads and bread. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith('ie')) return `${word.slice(0, -2)}y`;
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** The words that say what the item is: lower case, singular, without sizes, weights, numbers and filler. */
function coreOf(text: string): Set<string> {
  const words = tidy(text.replace(MEASURE, ' ')).split(' ').filter(Boolean);
  return new Set(words.filter(w => !SIZE_WORDS.has(w) && !FILLER.has(w) && !/^\d+$/.test(w)).map(stem));
}

const sizeWordIn = (text: string): string | null => tidy(text).split(' ').find(w => SIZE_WORDS.has(w)) ?? null;
const sameGroup = (a: string, b: string) => (LARGE_WORDS.includes(a) && LARGE_WORDS.includes(b)) || (SMALL_WORDS.includes(a) && SMALL_WORDS.includes(b)) || (MIDDLE_WORDS.includes(a) && MIDDLE_WORDS.includes(b));

/** What the words `written` mean among the menu's items. */
export function resolveMenuItem(written: string, menu: MenuNamed[]): MenuResolution {
  const wanted = coreOf(written);
  if (wanted.size === 0) return { kind: 'keep' };

  const cores = menu.map(item => ({ item, core: coreOf(item.name) }));
  const containing = cores.filter(c => [...wanted].every(w => c.core.has(w)));
  if (containing.length === 0) return { kind: 'keep' };
  const exact = containing.filter(c => c.core.size === wanted.size);
  const pool = (exact.length > 0 ? exact : containing).map(c => c.item);

  if (pool.length === 1) {
    // One whole match is the item. Words that merely appear in one longer name are left to the model and the owner, as before.
    return exact.length === 1 ? { kind: 'item', id: pool[0].id } : { kind: 'keep' };
  }
  if (exact.length === 0 && pool.length > MAX_LOOSE_CANDIDATES) return { kind: 'keep' };

  // Several of the same thing: a size that is written may choose.
  const measure = measureOf(written);
  if (measure) {
    const same = pool.filter(item => { const m = measureOf(item.name); return m && m.dimension === measure.dimension && m.amount === measure.amount; });
    if (same.length === 1) return { kind: 'item', id: same[0].id };
  }
  const size = sizeWordIn(written);
  if (size) {
    const named = pool.filter(item => { const s = sizeWordIn(item.name); return s !== null && sameGroup(s, size); });
    if (named.length === 1) return { kind: 'item', id: named[0].id };

    const measured = pool.map(item => ({ item, m: measureOf(item.name) }));
    const dimension = measured[0].m?.dimension;
    if (dimension && measured.every(x => x.m && x.m.dimension === dimension)) {
      const ranked = [...measured].sort((a, b) => a.m!.amount - b.m!.amount);
      const amounts = ranked.map(x => x.m!.amount);
      if (new Set(amounts).size === amounts.length) {
        if (LARGE_WORDS.includes(size)) return { kind: 'item', id: ranked[ranked.length - 1].item.id };
        if (SMALL_WORDS.includes(size)) return { kind: 'item', id: ranked[0].item.id };
        if (MIDDLE_WORDS.includes(size) && ranked.length === 3) return { kind: 'item', id: ranked[1].item.id };
      }
    }
  }
  return { kind: 'ask', options: pool.slice(0, MAX_VARIANT_OPTIONS) };
}
