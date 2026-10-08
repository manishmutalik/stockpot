/**
 * speechPhrases.ts
 *
 * The words the phone's speech recogniser is told to expect, so it hears "pumpkin seed bread" and not "pumpkin seat bread":
 * the owner's menu items and materials, and (only when the owner has asked for it) their customers' names. Menu items
 * come both as written and without the weight in brackets, because that is how people say them ("Pumpkin Seed Bread
 * (500g)" is spoken "pumpkin seed bread"). What is listed here is sent to the speech service along with the audio, which is
 * why customers' names are opt-in and never part of the default list.
 */

/** The recogniser takes a short list: the menu first, as it is what is said most. */
export const SPEECH_PHRASES_MAX = 100;
const PHRASE_MAX_CHARS = 60;

const WEIGHT = /\b\d+(?:\.\d+)?\s*(?:kilograms?|kilos?|kgs?|grams?|gms?|gm|g|millilit(?:re|er)s?|mls?|lit(?:re|er)s?|ltrs?|l)\b/gi;

/** A name as it is spoken: without anything in brackets or a weight. */
export function spokenName(name: string): string {
  return name.replace(/\([^)]*\)/g, ' ').replace(WEIGHT, ' ').replace(/\s+/g, ' ').trim();
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

export function speechPhrases(input: { menu: { name?: string }[]; materials: { name?: string }[]; customers?: string[] }): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string | undefined) => {
    const phrase = clean(raw ?? '');
    const key = phrase.toLowerCase();
    if (phrase.length < 2 || phrase.length > PHRASE_MAX_CHARS || seen.has(key) || out.length >= SPEECH_PHRASES_MAX) return;
    seen.add(key);
    out.push(phrase);
  };

  for (const item of input.menu) { add(spokenName(item.name ?? '')); }
  for (const item of input.menu) { add(item.name); }
  for (const name of input.customers ?? []) {
    if (/^customer not named$/i.test(name.trim())) continue;
    add(name);
    const first = clean(name).split(' ')[0];
    if (first && first.length >= 3 && first !== clean(name)) add(first);
  }
  for (const item of input.materials) { add(item.name); }
  return out;
}
