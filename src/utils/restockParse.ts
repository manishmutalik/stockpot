/**
 * restockParse.ts
 *
 * Reading "bought 5 kg butter for 2000" for the phone app's Stock in screen: the schema the model must follow, the check of
 * what it read against the message, and the draft and questions made from it. Built like the order and production readers:
 * the model only reads, and nothing it reads is trusted unless the message says it.
 *  - every quantity and price must be a number written in the message;
 *  - every unit must be written there too (kg, kilo, litre, packet...);
 *  - an item is only matched to a material the owner has, otherwise it is flagged ("add it in the web app first"), never created;
 *  - a missing price or unit becomes a question, never a guess.
 */
import type { RawMaterial } from '../types';
import { convertAmount, enterableUnits } from './conversions';
import { formatAmount } from './money';
import { redactPhones } from './aiPrivacy';
import { numberWritten, squash, suggestMenuItem } from './orderParse';
import { planRestock } from './plans';
import type { DraftResult, Question } from './quickParse';
import type { RestockDraft, RestockPreviewLine } from './quickApiTypes';

export type { RestockDraft, RestockPreviewLine } from './quickApiTypes';

export const RESTOCK_TEXT_MAX_CHARS = 1500;
export const RESTOCK_MAX_LINES = 15;
export const RESTOCK_MAX_MATERIALS = 400;

const UNITS = ['g', 'kg', 'ml', 'l', 'pcs'] as const;
type Unit = (typeof UNITS)[number];
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });

export const RESTOCK_SCHEMA = {
  type: 'object',
  properties: {
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nameAsWritten: { type: 'string' },
          materialId: nullable({ type: 'string' }),
          quantity: { type: 'number' },
          unit: nullable({ type: 'string', enum: [...UNITS] }),
          total: nullable({ type: 'number' }),
          pricePerUnit: nullable({ type: 'number' }),
        },
        required: ['nameAsWritten', 'materialId', 'quantity', 'unit', 'total', 'pricePerUnit'],
        additionalProperties: false,
      },
    },
  },
  required: ['lines'],
  additionalProperties: false,
} as const;

export interface ParsedRestockLine {
  nameAsWritten: string;
  /** A material id from the list that was sent, or null when the item is not one of the owner's materials. */
  materialId: string | null;
  quantity: number;
  unit: Unit | null;
  /** What was paid for the whole line, as written. */
  total: number | null;
  /** A price for one unit, as written ("400 a kg", "185/kg"): a rate, not what was paid for the line. */
  pricePerUnit: number | null;
  /**
   * The unit that rate is per. Worked out from the message by the code (never taken from the model), and null when the
   * message does not say it next to the price, in which case the rate is dropped and the total is asked.
   */
  priceUnit: Unit | null;
}
export interface ParsedRestock { lines: ParsedRestockLine[] }

/** The message as it is sent: whitespace tidied and phone numbers removed. */
export function prepareRestockText(raw: string): string {
  const collapsed = raw.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return redactPhones(collapsed, '[phone]').text.slice(0, RESTOCK_TEXT_MAX_CHARS);
}

const UNIT_WORDS: Record<Unit, RegExp> = {
  g: /(?<![a-z])(g|gm|gms|gram|grams|gramme|grammes)(?![a-z])/i,
  kg: /(?<![a-z])(kg|kgs|kilo|kilos|kilogram|kilograms|kilogramme|kilogrammes)(?![a-z])/i,
  ml: /(?<![a-z])(ml|mls|millilitre|millilitres|milliliter|milliliters)(?![a-z])/i,
  l: /(?<![a-z])(l|ltr|ltrs|litre|litres|liter|liters)(?![a-z])/i,
  pcs: /(?<![a-z])(pcs|pc|piece|pieces|packet|packets|pack|packs|box|boxes|bottle|bottles|tin|tins|tray|trays|bag|bags|unit|units|dozen)(?![a-z])/i,
};
const unitWritten = (unit: Unit, text: string) => UNIT_WORDS[unit].test(text);

/**
 * Every place the number is written in digits, with the unit it is quoted "per" when one follows it straight away
 * ("185/kg", "Rs.185 per kilo", "400 a kg", "0.25 / ml"), else null. "185" in "paid 185 for it" has no unit.
 */
export function numberOccurrences(value: number, text: string): { rateUnit: Unit | null }[] {
  const plain = text.replace(/(?<=\d),(?=\d)/g, '');
  const found: { rateUnit: Unit | null }[] = [];
  for (const m of plain.matchAll(/\d+(?:\.\d+)?/g)) {
    if (Number(m[0]) !== value) continue;
    const after = plain.slice((m.index ?? 0) + m[0].length);
    const rateUnit = (UNITS.find(u => new RegExp(`^\\s*(?:rs\\.?|rupees?|inr|\u20b9)?\\s*(?:/-)?\\s*(?:/|per\\b|a\\b|an\\b|each\\b|every\\b)\\s*(?:1\\s*)?${UNIT_WORDS[u].source}`, 'i').test(after)) ?? null) as Unit | null;
    found.push({ rateUnit });
  }
  return found;
}

/** A quantity is supported when its digits or words are written, or it is "half" / "quarter" / "one and a half". */
function quantityOk(q: number, text: string): boolean {
  if (numberWritten(q, text)) return true;
  const lower = text.toLowerCase();
  if (q === 0.5 && /\bhalf\b/.test(lower)) return true;
  if (q === 0.25 && /\bquarter\b/.test(lower)) return true;
  if (q % 1 === 0.5 && /\band a half\b/.test(lower) && numberWritten(Math.floor(q), text)) return true;
  if (q === 1 && /\b(a|an|one)\b/.test(lower)) return true;
  return false;
}

export type RestockValidation = { ok: true; parsed: ParsedRestock } | { ok: false; problems: string[] };
const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Checks the model's reading against the message that was sent and the material ids that were sent. */
export function validateParsedRestock(raw: unknown, input: { text: string; materialIds: Iterable<string> }): RestockValidation {
  if (!isObject(raw) || !Array.isArray(raw.lines)) return { ok: false, problems: ['the answer is not an object with a lines list'] };
  const ids = new Set(input.materialIds);
  const text = input.text;
  const squashed = squash(text);
  const problems: string[] = [];
  const lines: ParsedRestockLine[] = [];
  if (raw.lines.length === 0) problems.push('no items were read');
  if (raw.lines.length > RESTOCK_MAX_LINES) problems.push(`more than ${RESTOCK_MAX_LINES} items`);

  raw.lines.slice(0, RESTOCK_MAX_LINES).forEach((l: unknown, i: number) => {
    const at = `item ${i + 1}`;
    if (!isObject(l)) { problems.push(`${at} is not an object`); return; }
    const name = typeof l.nameAsWritten === 'string' ? l.nameAsWritten.trim() : '';
    if (!name || !squashed.includes(squash(name))) problems.push(`${at}: the name "${name}" is not written in the message`);
    const materialId = l.materialId === null || l.materialId === undefined ? null : l.materialId;
    if (materialId !== null && (typeof materialId !== 'string' || !ids.has(materialId))) problems.push(`${at}: materialId is not one of the materials sent`);
    const quantity = l.quantity;
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) problems.push(`${at}: quantity must be a number above nothing`);
    else if (!quantityOk(quantity, text)) problems.push(`${at}: quantity ${quantity} is not written in the message`);
    const unit = l.unit === null || l.unit === undefined ? null : l.unit;
    if (unit !== null && !(UNITS as readonly string[]).includes(unit)) problems.push(`${at}: unit must be one of ${UNITS.join(', ')} or null`);
    else if (unit !== null && !unitWritten(unit as Unit, text)) problems.push(`${at}: the unit ${unit} is not written in the message`);
    for (const field of ['total', 'pricePerUnit'] as const) {
      const v = l[field];
      if (v === null || v === undefined) continue;
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 1_000_000_000) problems.push(`${at}: ${field} must be a number above nothing`);
      else if (!numberWritten(v, text)) problems.push(`${at}: ${field} ${v} is not written in the message`);
    }
    if (problems.length === 0) {
      let total = (l.total ?? null) as number | null;
      let pricePerUnit = (l.pricePerUnit ?? null) as number | null;
      // A number written only as a rate ("185/kg") is not what was paid for the line, whichever field the model put it in.
      if (total !== null) {
        const seen = numberOccurrences(total, text);
        if (seen.length > 0 && seen.every(o => o.rateUnit !== null)) { if (pricePerUnit === null) pricePerUnit = total; total = null; }
      }
      // The unit a rate is per is whatever is written next to it. If none is, the rate is not used: the total is asked.
      let priceUnit: Unit | null = null;
      if (pricePerUnit !== null) {
        priceUnit = numberOccurrences(pricePerUnit, text).find(o => o.rateUnit !== null)?.rateUnit ?? null;
        if (priceUnit === null) pricePerUnit = null;
      }
      lines.push({ nameAsWritten: name, materialId: materialId as string | null, quantity: quantity as number, unit: unit as Unit | null, total, pricePerUnit, priceUnit });
    }
  });
  return problems.length > 0 ? { ok: false, problems: problems.slice(0, 8) } : { ok: true, parsed: { lines } };
}

// ─── From the reading to a draft ────────────────────────────────────────────

export type RestockDraftLine = RestockDraft['lines'][number];

const AMOUNT_MAX = 1_000_000_000;
const validAmount = (v: string | undefined): number | null => {
  if (v === undefined || !/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const n = Number(v);
  return n > 0 && n <= AMOUNT_MAX ? n : null;
};
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * The stock bought, as the restock endpoint takes it, and what is still open.
 * Questions (answer ids): `material:N` which material the Nth line is (a material id, or `skip`); `unit:N` which unit the
 * quantity is in (when it is not written, or does not fit the material); `total:N` what was paid for the line.
 */
export function buildRestockDraft(input: {
  parsed: ParsedRestock;
  materials: Pick<RawMaterial, 'id' | 'name' | 'unit'>[];
  answers: Map<string, string>;
  currency: { code: string; symbol: string };
}): DraftResult<RestockDraft> {
  const { parsed, materials, answers } = input;
  const questions: Question[] = [];
  const notes: string[] = [];
  const lines: RestockDraftLine[] = [];

  parsed.lines.forEach((line, i) => {
    // Which material.
    let materialId = line.materialId;
    if (materialId === null) {
      const chosen = answers.get(`material:${i}`);
      if (chosen === 'skip') { notes.push(`Left out ${line.nameAsWritten}.`); return; }
      if (chosen && materials.some(m => m.id === chosen)) materialId = chosen;
    }
    if (materialId === null) {
      const suggestion = suggestMenuItem(line.nameAsWritten, materials);
      questions.push({
        id: `material:${i}`, type: 'choice',
        prompt: `"${line.nameAsWritten}" is not in your materials. Pick the one it is, or leave it out and add it in the web app first.`,
        options: [...(suggestion ? [{ value: suggestion.id, label: suggestion.name }] : []), { value: 'skip', label: 'Leave it out' }],
      });
      return;
    }
    const material = materials.find(m => m.id === materialId)!;
    const own = material.unit || 'g';
    const fits = enterableUnits(own);

    // Which unit: the one written if it fits the material; otherwise ask (a bare "5 butter" is not 5 grams).
    let unit: string | null = line.unit && fits.includes(line.unit) ? line.unit : null;
    if (unit === null && !line.unit && own === 'pcs') unit = 'pcs';
    if (unit === null) {
      const chosen = answers.get(`unit:${i}`);
      if (chosen && fits.includes(chosen)) unit = chosen;
    }
    if (unit === null) {
      questions.push({
        id: `unit:${i}`, type: 'choice',
        prompt: line.unit
          ? `${material.name} is kept in ${own}, so ${line.quantity} ${line.unit} does not fit. Which unit is ${line.quantity}?`
          : `Is ${line.quantity} ${material.name} in ${fits.join(' or ')}?`,
        options: fits.map(u => ({ value: u, label: u })),
      });
      return;
    }

    // What was paid.
    let total: number | null = validAmount(answers.get(`total:${i}`));
    if (total === null && line.total !== null) total = line.total;
    // A rate is for the unit written beside it (185 a kg), so the quantity is put into that unit first: 500 g at 185 a kg is 0.5 kg, 92.50.
    if (total === null && line.pricePerUnit !== null && line.priceUnit && line.unit === unit && enterableUnits(line.priceUnit).includes(unit)) {
      total = round2(line.pricePerUnit * convertAmount(line.quantity, unit, line.priceUnit));
    }
    if (total === null) {
      questions.push({ id: `total:${i}`, type: 'amount', prompt: `How much did you pay for ${line.quantity} ${unit} of ${material.name}?` });
      return;
    }
    lines.push({ materialId, quantity: line.quantity, unit, total });
  });

  return { draft: { lines }, questions, notes };
}

// ─── What the save will do ──────────────────────────────────────────────────

const displayUnit = (unit: string): { unit: string; factor: number } => (unit === 'g' ? { unit: 'kg', factor: 1000 } : unit === 'ml' ? { unit: 'l', factor: 1000 } : { unit, factor: 1 });

/** The same plan the save runs, line by line from the stock as it stands, so the figures are the ones that will be saved. */
export function previewRestock(input: {
  draft: RestockDraft;
  materials: RawMaterial[];
  menu: { id: string; name: string; recipe?: { materialId: string; amount: number; unit?: string }[] }[];
  currency: { code: string; symbol: string };
}): { ok: true; lines: RestockPreviewLine[]; total: number; label: { total: string } } | { ok: false; message: string } {
  const working = new Map(input.materials.map(m => [m.id, m]));
  const out: RestockPreviewLine[] = [];
  const money = (n: number) => formatAmount(n, input.currency);
  let grand = 0;

  for (const line of input.draft.lines) {
    const material = working.get(line.materialId);
    if (!material) return { ok: false, message: `${line.materialId} is not in your materials.` };
    const plan = planRestock({ material, quantity: line.quantity, quantityUnit: line.unit, total: line.total, ctx: { newId: () => 'preview', now: () => 0 } });
    if (plan.ok === false) return { ok: false, message: 'Each line needs a quantity above nothing.' };
    working.set(material.id, { ...material, initialStock: plan.newStock, costPerUnit: plan.newCostPerUnit });

    const own = material.unit || 'g';
    const shown = displayUnit(own);
    const prev = plan.previousCostPerUnit * shown.factor;
    const next = plan.newCostPerUnit * shown.factor;
    const delta = plan.newCostPerUnit - plan.previousCostPerUnit;
    const affected = input.menu.flatMap(item => {
      const use = (item.recipe ?? []).filter(r => r.materialId === material.id);
      if (use.length === 0) return [];
      const perUnit = use.reduce((s, r) => s + (r.unit && r.unit !== own ? convertAmount(r.amount, r.unit, own) : r.amount), 0);
      return [{ menuItemId: item.id, name: item.name, costChange: round2(perUnit * delta) }];
    }).sort((a, b) => Math.abs(b.costChange) - Math.abs(a.costChange));

    grand += line.total;
    out.push({
      materialId: material.id, name: material.name, quantity: line.quantity, unit: line.unit, total: line.total,
      newStock: Math.round(plan.newStock * 1e4) / 1e4, stockUnit: own, costUnit: shown.unit,
      previousCost: round2(prev), newCost: round2(next),
      costChangePct: plan.previousCostPerUnit > 0 ? Math.round(((plan.newCostPerUnit - plan.previousCostPerUnit) / plan.previousCostPerUnit) * 1000) / 10 : null,
      recipesAffected: affected,
      label: { total: money(line.total), previousCost: money(round2(prev)), newCost: money(round2(next)) },
    });
  }
  return { ok: true, lines: out, total: round2(grand), label: { total: money(grand) } };
}
