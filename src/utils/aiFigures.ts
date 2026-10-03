/**
 * aiFigures.ts
 *
 * How "no model-generated financial figures" is enforced (docs/AI_CFO_DESIGN.md).
 *
 * The model is never asked to write a number. Its prose may contain only words
 * and *tokens* that point at values the application computed itself:
 *
 *   {{fig:true_profit_change}}   a figure from the registry, formatted here
 *   {{name:item_3}}              a name (a product, a material), by id
 *   {{cust:C-4F2A}}              a customer label, replaced by their name on the client
 *
 * `validateAiText` rejects any text that carries a digit or a spelled-out
 * number outside a token, or a token that does not exist; `renderAiText`
 * replaces the tokens with the application's own formatting. A rejected answer
 * is never shown. This file is pure (no React, Firebase or network) and is used
 * by both the server (to validate before replying) and the browser (to render).
 *
 * What it cannot do is tell whether a sentence is *right*: it guarantees there
 * is no invented number in it, not that it names the right driver.
 */

export type FigureKind = 'money' | 'percent' | 'count' | 'days' | 'date';

export interface Figure {
  kind: FigureKind;
  /** The number, or an ISO date (YYYY-MM-DD) for `date`. */
  value: number | string;
  /** What the figure is, in words, for the model ("Yesterday's revenue"). */
  label: string;
  /** Show a leading + or - (for changes). */
  signed?: boolean;
}

export interface AiRegistry {
  figures: Record<string, Figure>;
  /** Names by id: products, materials. Customers are not here (labels only). */
  names: Record<string, string>;
}

export interface FormatContext {
  currencySymbol: string;
  /** Locale for digit grouping: en-IN groups as 1,00,000. */
  locale?: string;
}

const ID = '[A-Za-z0-9_.-]+';
const TOKEN = new RegExp(`\\{\\{(fig|name|cust):(${ID})\\}\\}`, 'g');

export const AI_TEXT_MAX_CHARS = 700;

/** The numbers an owner would notice, spelled out. "one" is left alone: it is also a pronoun. */
const NUMBER_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|lakhs?|crores?|million|billion|percent|per ?cent|dozen)\b/i;

/** Splits text into the parts outside tokens and the tokens themselves. */
function stripTokens(text: string): string {
  return text.replace(TOKEN, ' ');
}

export interface TextValidation {
  ok: boolean;
  problems: string[];
}

/**
 * Whether model text may be shown. `known` lists the ids the snapshot offered;
 * a token for anything else is refused.
 */
export function validateAiText(
  text: unknown,
  known: { figures: Iterable<string>; names: Iterable<string>; customers?: Iterable<string> },
  maxChars: number = AI_TEXT_MAX_CHARS
): TextValidation {
  const problems: string[] = [];
  if (typeof text !== 'string' || text.trim() === '') return { ok: false, problems: ['empty'] };
  if (text.length > maxChars) problems.push('too long');

  const figures = new Set(known.figures);
  const names = new Set(known.names);
  const customers = new Set(known.customers ?? []);
  for (const m of text.matchAll(TOKEN)) {
    const [, kind, id] = m;
    const set = kind === 'fig' ? figures : kind === 'name' ? names : customers;
    if (!set.has(id)) problems.push(`unknown ${kind} token "${id}"`);
  }

  const outside = stripTokens(text);
  if (/\d/.test(outside)) problems.push('a digit outside a token');
  if (NUMBER_WORDS.test(outside)) problems.push('a spelled-out number outside a token');
  if (/[₹$€£¥%]/.test(outside)) problems.push('a currency or percent sign outside a token');
  if (/\{\{|\}\}/.test(outside)) problems.push('a malformed token');
  return { ok: problems.length === 0, problems };
}

const group = (n: number, locale: string, maxFraction: number) =>
  n.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: maxFraction });

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Thu 2 Oct". Built by hand so the text does not depend on the runtime's locale data. */
const WEEKDAY = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
};

/** A figure as the application shows it. The one place a number becomes text for the AI features. */
export function formatFigure(figure: Figure, ctx: FormatContext): string {
  const locale = ctx.locale ?? 'en-IN';
  if (figure.kind === 'date') return WEEKDAY(String(figure.value));
  const n = Number(figure.value);
  const abs = Math.abs(n);
  const sign = figure.signed ? (n > 0 ? '+' : n < 0 ? '-' : '') : n < 0 ? '-' : '';
  switch (figure.kind) {
    case 'money': {
      // Whole currency units from 100 up, otherwise to the paisa.
      const body = group(abs, locale, abs >= 100 ? 0 : 2);
      return `${sign}${ctx.currencySymbol}${body}`;
    }
    case 'percent':
      return `${sign}${group(abs, locale, abs >= 10 ? 0 : 1)}%`;
    case 'days':
      return `${sign}${group(abs, locale, 0)} ${Math.round(abs) === 1 ? 'day' : 'days'}`;
    case 'count':
    default:
      return `${sign}${group(abs, locale, 0)}`;
  }
}

/**
 * Replaces tokens with the application's own values. Meant for validated text;
 * a token that cannot be resolved renders as a dash rather than being left as
 * braces or guessed at. `customers` maps a label to the name to show.
 */
export function renderAiText(
  text: string,
  registry: AiRegistry,
  ctx: FormatContext,
  customers: Record<string, string> = {}
): string {
  return text.replace(TOKEN, (_all, kind: string, id: string) => {
    if (kind === 'fig') {
      const figure = registry.figures[id];
      return figure ? formatFigure(figure, ctx) : '-';
    }
    if (kind === 'name') return registry.names[id] ?? '-';
    return customers[id] ?? '-';
  });
}

/** The same text with every token reduced to its id: what a person or a test sees when reading a prompt. */
export const tokenIds = (text: string): { kind: string; id: string }[] =>
  Array.from(text.matchAll(TOKEN), m => ({ kind: m[1], id: m[2] }));
