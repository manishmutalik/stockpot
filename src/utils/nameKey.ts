/**
 * nameKey.ts
 *
 * What two names of one item have in common once the way they were typed is set aside: case, spacing, punctuation, a
 * pack size ("Butter 500 g") and a plural ("Eggs"). Used to find an item by its name wherever a name is typed or read:
 * the duplicate warnings (utils/duplicates), CSV import (utils/inventoryImport) and reading a recipe (utils/kitchenMeasures,
 * utils/recipeDraft), on the web and the phone alike. Kept on its own, with nothing but `squash`, so any of those can use it.
 */
import { squash } from './orderParse';

/** A pack size or count written into a name: "500 g", "1kg", "2 l", "12 pcs", or a bare number. */
const PACK_SIZE = /(^|\s)\d+(?:\.\d+)?\s*(?:kg|kgs|g|gm|gms|gram|grams|ml|l|ltr|litre|litres|liter|liters|pc|pcs|piece|pieces)?(?=\s|$)/g;

/** One word in the singular: "eggs" is "egg", "berries" "berry", "tomatoes" "tomato"; "glass" stays. */
function singular(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith('oes')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** A name with case, spacing, punctuation, pack sizes and plurals set aside: what two names of one item share. */
export function nameKey(name: string): string {
  return squash(name).replace(PACK_SIZE, ' ').split(/\s+/).filter(Boolean).map(singular).join(' ');
}
