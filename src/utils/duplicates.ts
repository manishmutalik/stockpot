/**
 * duplicates.ts
 *
 * Whether two inventory items are the same thing under two names, so Stockpot can say "you already have this" before a
 * second one is made, flag the ones already there, and update an item from a CSV instead of adding it again.
 *
 * Two levels:
 *  - the same item (`sameItemName`): the same name once case, spacing, punctuation, a plural and a pack size are set
 *    aside ("Eggs" and "egg", "Butter 500 g" and "butter"), or two names the kitchen table (utils/kitchenMeasures) says
 *    are one thing ("Chini" and "Sugar", "Maida" and "All purpose flour"). Said plainly: "You already have Sugar".
 *  - perhaps the same (`maybeSameItemName`): the table puts both under one thing and they end in the same word ("Amul
 *    Butter" and "Butter", not "Milk powder" and "Milk"), or, for names it does not know, one name ends with the whole of
 *    the other ("Paneer" and "Malai Paneer"). Asked as a question,
 *    since "Salted Butter" and "Unsalted Butter" are both butter and still two things.
 * Never the same: two names the table keeps apart ("Sugar" and "Icing Sugar").
 */
import { TYPICAL_WEIGHTS, typicalWeightFor } from './kitchenMeasures';
import { nameKey } from './nameKey';

export { nameKey };

/** Which kitchen-table thing a name is, when the name is exactly one of that thing's names. */
const SYNONYM_OF = (() => {
  const map = new Map<string, number>();
  TYPICAL_WEIGHTS.forEach((entry, i) => entry.names.forEach(n => { const k = nameKey(n); if (k && !map.has(k)) map.set(k, i); }));
  return map;
})();

/** The name a new, not yet named item is given ("New Raw Materials Item"), or no name at all: never a duplicate. */
export const isPlaceholderName = (name: string | undefined) => !name?.trim() || /^new .* item$/i.test(name.trim());

/** The same item under two names (see the top of this file). */
export function sameItemName(a: string, b: string): boolean {
  if (isPlaceholderName(a) || isPlaceholderName(b)) return false;
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const sa = SYNONYM_OF.get(ka);
  return sa !== undefined && sa === SYNONYM_OF.get(kb);
}

/** Perhaps the same item: worth asking, not worth saying (see the top of this file). */
export function maybeSameItemName(a: string, b: string): boolean {
  if (isPlaceholderName(a) || isPlaceholderName(b) || sameItemName(a, b)) return false;
  const wa = nameKey(a).split(' ');
  const wb = nameKey(b).split(' ');
  const ea = typicalWeightFor(a);
  const eb = typicalWeightFor(b);
  // The table knows both: the same thing, and the same last word (it files "Milk powder" under milk, but the last word
  // says what a thing is).
  if (ea && eb) return ea === eb && wa[wa.length - 1] === wb[wb.length - 1];
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  return short[0] !== '' && long.length > short.length && long.slice(-short.length).join(' ') === short.join(' ');
}

/** The items that are, or perhaps are, the same as `name`, leaving out the item being named (`exceptId`). */
export function similarItems<M extends { id: string; name: string }>(name: string, items: M[], exceptId?: string): { same: M[]; maybe: M[] } {
  const others = items.filter(m => m.id !== exceptId);
  return {
    same: others.filter(m => sameItemName(name, m.name)),
    maybe: others.filter(m => maybeSameItemName(name, m.name)),
  };
}

/** For each item that has a twin under another (or the same) name, the twins: what the inventory flags as duplicates. */
export function duplicatesOf<M extends { id: string; name: string }>(items: M[]): Map<string, M[]> {
  const found = new Map<string, M[]>();
  for (const item of items) {
    const twins = items.filter(other => other.id !== item.id && sameItemName(item.name, other.name));
    if (twins.length > 0) found.set(item.id, twins);
  }
  return found;
}
