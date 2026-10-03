/**
 * aiChat.ts
 *
 * "Ask your business", shared by the server (to validate what the model wrote)
 * and the browser (to prepare a question and choose the period).
 *
 * The same rule as the briefing applies (docs/AI_CFO_DESIGN.md): the model
 * writes words and tokens, never a number. Its answer is checked against the
 * snapshot that was sent, and an answer that does not pass is never shown.
 *
 * Privacy: the question is prepared on the browser. Customer names the owner
 * types are replaced by the customer's label, and phone-number-like digits are
 * removed, before anything is sent.
 */
import { validateAiText } from './aiFigures';
import { knownIdsFromSnapshot } from './aiBriefing';
import type { AiSnapshot } from './aiSnapshot';
import { addDays } from './localDate';

export const CHAT_MAX_QUESTION_CHARS = 500;
export const CHAT_MAX_ANSWER_CHARS = 1200;
export const CHAT_MAX_HISTORY_TURNS = 4;

/** The JSON schema the model's answer must follow (structured outputs). */
export const CHAT_SCHEMA = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
  additionalProperties: false,
} as const;

/** One earlier exchange, as kept for context: the question as sent, and the model's answer with its tokens. */
export interface ChatTurn {
  question: string;
  answer: string;
}

export const trimHistory = (turns: ChatTurn[]): ChatTurn[] => turns.slice(-CHAT_MAX_HISTORY_TURNS);

export type ChatAnswerValidation = { ok: true; answer: string } | { ok: false; problems: string[] };

/** Checks the model's answer: its shape, then the figure guard against the ids the snapshot offered. */
export function validateChatAnswer(raw: unknown, snapshot: AiSnapshot): ChatAnswerValidation {
  const obj = raw as { answer?: unknown } | null;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, problems: ['the answer is not an object'] };
  const checked = validateAiText(obj.answer, knownIdsFromSnapshot(snapshot), CHAT_MAX_ANSWER_CHARS);
  return checked.ok ? { ok: true, answer: (obj.answer as string).trim() } : { ok: false, problems: checked.problems };
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PHONE_LIKE = /\+?\d[\d\s().-]{6,}\d/g;

/**
 * The question as it is sent. Customer names become labels (so the server never
 * sees a name) and the labels found are returned so the snapshot can include
 * those customers. A first name alone matches only when it is unique.
 */
export function prepareQuestion(
  raw: string,
  customers: { name: string; label: string }[]
): { text: string; mentioned: string[] } {
  let text = raw.replace(/\s+/g, ' ').trim().replace(PHONE_LIKE, '[number]');

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
  return { text: text.slice(0, CHAT_MAX_QUESTION_CHARS), mentioned };
}

export type ChatPeriodId = 'month' | 'last_month' | '7d' | '30d';

export interface ChatPeriod {
  id: ChatPeriodId;
  label: string;
  period: { start: string; end: string };
  comparison: { start: string; end: string; label: string };
}

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate(); // month is 1-12
const pad = (n: number) => String(n).padStart(2, '0');

/** The periods the owner can ask about, each with what it is compared against. `today` is in the business's time zone. */
export function chatPeriods(today: string): ChatPeriod[] {
  const [y, m, d] = today.split('-').map(Number);
  const prevYear = m === 1 ? y - 1 : y;
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevMonthDays = daysInMonth(prevYear, prevMonth);
  const prevStart = `${prevYear}-${pad(prevMonth)}-01`;
  const monthBeforeYear = prevMonth === 1 ? prevYear - 1 : prevYear;
  const monthBefore = prevMonth === 1 ? 12 : prevMonth - 1;

  return [
    {
      id: 'month', label: 'This month so far',
      period: { start: `${y}-${pad(m)}-01`, end: today },
      comparison: { start: prevStart, end: `${prevYear}-${pad(prevMonth)}-${pad(Math.min(d, prevMonthDays))}`, label: 'the same stretch of last month' },
    },
    {
      id: 'last_month', label: 'Last month',
      period: { start: prevStart, end: `${prevYear}-${pad(prevMonth)}-${pad(prevMonthDays)}` },
      comparison: { start: `${monthBeforeYear}-${pad(monthBefore)}-01`, end: `${monthBeforeYear}-${pad(monthBefore)}-${pad(daysInMonth(monthBeforeYear, monthBefore))}`, label: 'the month before' },
    },
    {
      id: '7d', label: 'Last 7 days',
      period: { start: addDays(today, -6), end: today },
      comparison: { start: addDays(today, -13), end: addDays(today, -7), label: 'the 7 days before' },
    },
    {
      id: '30d', label: 'Last 30 days',
      period: { start: addDays(today, -29), end: today },
      comparison: { start: addDays(today, -59), end: addDays(today, -30), label: 'the 30 days before' },
    },
  ];
}

/** Questions offered on an empty chat. Each one the snapshot can answer today. */
export const STARTER_QUESTIONS = [
  'Why did my profit change?',
  'What should I stop selling?',
  'Which customers should I get back in touch with?',
  'Where am I losing money?',
] as const;
