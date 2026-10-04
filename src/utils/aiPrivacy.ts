/**
 * aiPrivacy.ts
 *
 * What is taken out of text typed or pasted by the owner before it is sent to
 * the AI service (docs/AI_CFO_DESIGN.md, Privacy). Done on the browser, so the
 * server and the model never see what is removed: customer names the app knows
 * become the customer's label, and phone-number-like digits are removed (and
 * handed back so the app can use them itself).
 */

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A digit run that reads as a phone number: 8 or more digits, with spaces, dashes or brackets between them. */
const PHONE_LIKE = /(?<![\d.])\+?\(?\d(?:[\s().-]{0,2}\d){7,}(?![\d])/g;

/**
 * Replaces each phone-number-like run with `placeholder`. Returns the text and
 * the numbers found, as typed, in order. Small numbers (quantities, prices,
 * dates) are not touched.
 */
export function redactPhones(raw: string, placeholder = '[number]'): { text: string; phones: string[] } {
  const phones: string[] = [];
  const text = raw.replace(PHONE_LIKE, found => { phones.push(found.trim()); return placeholder; });
  return { text, phones };
}

/**
 * Replaces the names of customers the app knows with their labels, and reports
 * which labels were found. A full name matches as it is; a first name alone
 * matches only when it is unique among the customers. Words inside other words
 * and names shorter than three letters are left alone.
 */
export function replaceCustomerNames(raw: string, customers: { name: string; label: string }[]): { text: string; mentioned: string[] } {
  let text = raw;
  const firstNames = new Map<string, string[]>();
  for (const c of customers) {
    const first = c.name.trim().split(/\s+/)[0]?.toLowerCase();
    if (first && first.length >= 3) firstNames.set(first, [...(firstNames.get(first) ?? []), c.label]);
  }
  const candidates: { phrase: string; label: string }[] = [];
  for (const c of customers) {
    const full = c.name.trim();
    if (full.length >= 3) candidates.push({ phrase: full, label: c.label });
  }
  for (const [first, labels] of firstNames) if (labels.length === 1) candidates.push({ phrase: first, label: labels[0] });
  candidates.sort((a, b) => b.phrase.length - a.phrase.length);

  const mentioned: string[] = [];
  for (const { phrase, label } of candidates) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(phrase).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, 'giu');
    if (re.test(text)) {
      text = text.replace(re, label);
      if (!mentioned.includes(label)) mentioned.push(label);
    }
  }
  return { text, mentioned };
}
