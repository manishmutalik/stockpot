import { describe, it, expect } from 'vitest';
import { CHAT_MAX_ANSWER_CHARS, CHAT_MAX_HISTORY_TURNS, CHAT_MAX_QUESTION_CHARS, CHAT_SCHEMA, chatPeriods, prepareQuestion, trimHistory, validateChatAnswer } from '../aiChat';
import { buildBusinessSnapshot } from '../aiSnapshot';
import { buildCustomerProfiles } from '../customers';
import { daysBetween } from '../localDate';

const TODAY = '2026-06-30';
const materials: any[] = [{ id: 'flour', name: 'Flour', unit: 'kg', costPerUnit: 40, category: 'Raw Materials', initialStock: 10, remaining: 10, threshold: 2 }];
const menu: any[] = [
  { id: 'cake', name: 'Chocolate Cake', sellingPrice: 100, recipe: [{ materialId: 'flour', amount: 500, unit: 'g' }] },
  { id: 'pie', name: 'Apple Pie', sellingPrice: 80, recipe: [] },
];
const order = (id: string, date: string, over: Record<string, any> = {}): any => ({
  id, menuItemId: 'cake', quantity: 1, date, unitPriceAtSale: 100, unitIngredientCostAtSale: 20, unitPackagingCostAtSale: 0, unitInputGstAtSale: 0,
  itemNameAtSale: 'Chocolate Cake', ...over,
});
const settings: any = { name: 'Asha Bakes', gstApplicable: false, timezone: 'Asia/Kolkata' };
const orders = [
  order('a', '2026-06-29', { customerName: 'Priya Sharma', customerPhone: '+91 98450 10101' }),
  order('b', '2026-06-20', { customerName: 'Rahul Verma', customerPhone: '+91 98450 20202' }),
];
const customers = buildCustomerProfiles({ orders, menu, materials, settings, today: TODAY });
const priya = customers.find(c => c.name === 'Priya Sharma')!;
const rahul = customers.find(c => c.name === 'Rahul Verma')!;
const snap = (mentioned: string[] = []) => buildBusinessSnapshot({
  period: { start: '2026-06-01', end: TODAY }, orders, menu, materials, experiments: [], wastageLogs: [], settings,
  currency: { code: 'INR', symbol: '₹' }, customers, today: TODAY, mentionedCustomers: mentioned,
});

describe('validateChatAnswer', () => {
  const { promptSnapshot } = snap([priya.label]);

  it('keeps an answer made of words and tokens that exist, trimmed', () => {
    const r = validateChatAnswer({ answer: ` Profit moved {{fig:true_profit_change}}.\n- {{name:item_cake}} led.\n- {{cust:${priya.label}}} ordered recently. ` }, promptSnapshot);
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.answer.startsWith('Profit moved')).toBe(true);
  });

  it('accepts a customer who was named in the question', () => {
    expect(validateChatAnswer({ answer: `{{cust:${priya.label}}} is a regular.` }, promptSnapshot).ok).toBe(true);
    expect(validateChatAnswer({ answer: `{{cust:${rahul.label}}} is a regular.` }, promptSnapshot).ok).toBe(false);
  });

  it('refuses a number the model wrote itself, however it is written', () => {
    for (const answer of ['Profit fell 12 percent.', 'Profit fell by ₹500.', 'Profit fell by five hundred.', 'Down 8%.', '1. Raise prices']) {
      expect(validateChatAnswer({ answer }, promptSnapshot).ok).toBe(false);
    }
  });

  it('refuses unknown tokens, an empty answer, a wrong shape and an overlong answer', () => {
    expect(validateChatAnswer({ answer: '{{fig:made_up}}' }, promptSnapshot).ok).toBe(false);
    expect(validateChatAnswer({ answer: '   ' }, promptSnapshot).ok).toBe(false);
    expect(validateChatAnswer({ text: 'hi' }, promptSnapshot).ok).toBe(false);
    expect(validateChatAnswer(null, promptSnapshot).ok).toBe(false);
    expect(validateChatAnswer([], promptSnapshot).ok).toBe(false);
    expect(validateChatAnswer({ answer: 'a'.repeat(CHAT_MAX_ANSWER_CHARS + 1) }, promptSnapshot).ok).toBe(false);
    expect(validateChatAnswer({ answer: 'a'.repeat(CHAT_MAX_ANSWER_CHARS) }, promptSnapshot).ok).toBe(true);
  });

  it('says what was wrong, so the model can be told', () => {
    const r = validateChatAnswer({ answer: 'Fell 12' }, promptSnapshot);
    expect(r.ok === false && r.problems.join(' ')).toMatch(/digit/);
  });

  it('asks for exactly one answer field', () => {
    expect(CHAT_SCHEMA.required).toEqual(['answer']);
    expect(CHAT_SCHEMA.additionalProperties).toBe(false);
  });
});

describe('prepareQuestion', () => {
  it('replaces a full name with the label and reports who was mentioned', () => {
    const r = prepareQuestion('How much has Priya Sharma spent?', customers);
    expect(r.text).toBe(`How much has ${priya.label} spent?`);
    expect(r.mentioned).toEqual([priya.label]);
  });

  it('matches a first name when it is unique, in any case', () => {
    const r = prepareQuestion('what about rahul and PRIYA?', customers);
    expect(r.text).toBe(`what about ${rahul.label} and ${priya.label}?`);
    expect(r.mentioned.sort()).toEqual([priya.label, rahul.label].sort());
  });

  it('leaves a first name alone when two customers share it', () => {
    const twins = [{ name: 'Priya Sharma', label: 'C-AAAA' }, { name: 'Priya Nair', label: 'C-BBBB' }];
    expect(prepareQuestion('Is Priya a regular?', twins)).toEqual({ text: 'Is Priya a regular?', mentioned: [] });
    expect(prepareQuestion('Is Priya Nair a regular?', twins)).toEqual({ text: 'Is C-BBBB a regular?', mentioned: ['C-BBBB'] });
  });

  it('does not match inside another word, and ignores very short names', () => {
    const c = [{ name: 'Ann Lee', label: 'C-AAAA' }, { name: 'Al', label: 'C-BBBB' }, { name: 'Rose Fernandes', label: 'C-CCCC' }];
    expect(prepareQuestion('Annual sales and alpha', c).mentioned).toEqual([]);
    expect(prepareQuestion('Roses are red', c).mentioned).toEqual([]);
    expect(prepareQuestion('Ask Ann.', c).mentioned).toEqual(['C-AAAA']);
  });

  it('takes out anything that looks like a phone number, but keeps small numbers', () => {
    const r = prepareQuestion('Did +91 98450 10101 order in the last 30 days? Also 9845010101.', customers);
    expect(r.text).toBe('Did [number] order in the last 30 days? Also [number].');
  });

  it('copes with names that have regex characters, and with extra spaces', () => {
    const c = [{ name: 'A.J. (Bakes)', label: 'C-AAAA' }];
    expect(prepareQuestion('  how   is  A.J. (Bakes)  doing? ', c).text).toBe('how is C-AAAA doing?');
  });

  it('keeps a long question within the limit', () => {
    expect(prepareQuestion('x'.repeat(2000), customers).text).toHaveLength(CHAT_MAX_QUESTION_CHARS);
  });
});

describe('the snapshot for a chat question', () => {
  it('adds the customers named in the question, as labels and figures with no name or phone', () => {
    const { promptSnapshot, customerNames } = snap([priya.label]);
    expect(promptSnapshot.customers.mentioned).toHaveLength(1);
    expect(promptSnapshot.customers.mentioned[0]).toMatchObject({ label: priya.label, status: priya.status });
    expect(customerNames[priya.label]).toBe('Priya Sharma');
    const text = JSON.stringify(promptSnapshot);
    expect(text).not.toContain('Priya');
    expect(text).not.toContain('98450');
  });

  it('has no mentioned customers unless asked, ignores unknown labels, and caps the list', () => {
    expect(snap().promptSnapshot.customers.mentioned).toEqual([]);
    expect(snap(['C-NONE']).promptSnapshot.customers.mentioned).toEqual([]);
    const many = Array.from({ length: 9 }, (_, i) => ({ ...priya, label: `C-${i}` }));
    const built = buildBusinessSnapshot({
      period: { start: '2026-06-01', end: TODAY }, orders, menu, materials, experiments: [], wastageLogs: [], settings,
      currency: { code: 'INR', symbol: '₹' }, customers: many, today: TODAY, mentionedCustomers: many.map(m => m.label),
    });
    expect(built.promptSnapshot.customers.mentioned).toHaveLength(5);
  });

  it('lists menu items with no sales in the period', () => {
    const { promptSnapshot } = snap();
    expect(promptSnapshot.unsoldItems).toEqual(['item_pie']);
    expect(promptSnapshot.names.item_pie).toBe('Apple Pie');
  });
});

describe('chatPeriods', () => {
  const byId = (today: string) => Object.fromEntries(chatPeriods(today).map(p => [p.id, p]));

  it('compares this month so far with the same stretch of last month', () => {
    const p = byId('2026-06-30').month;
    expect(p.period).toEqual({ start: '2026-06-01', end: '2026-06-30' });
    expect(p.comparison).toMatchObject({ start: '2026-05-01', end: '2026-05-30' });
  });

  it('does not run past the end of a shorter month', () => {
    expect(byId('2026-03-31').month.comparison).toMatchObject({ start: '2026-02-01', end: '2026-02-28' });
    expect(byId('2028-03-31').month.comparison).toMatchObject({ end: '2028-02-29' });
  });

  it('handles January', () => {
    const p = byId('2026-01-15');
    expect(p.month.comparison).toMatchObject({ start: '2025-12-01', end: '2025-12-15' });
    expect(p.last_month.period).toEqual({ start: '2025-12-01', end: '2025-12-31' });
    expect(p.last_month.comparison).toMatchObject({ start: '2025-11-01', end: '2025-11-30' });
  });

  it('takes last month whole, against the month before', () => {
    const p = byId('2026-06-30').last_month;
    expect(p.period).toEqual({ start: '2026-05-01', end: '2026-05-31' });
    expect(p.comparison).toMatchObject({ start: '2026-04-01', end: '2026-04-30' });
  });

  it('compares 7 and 30 days with the same number of days just before', () => {
    const p = byId('2026-06-30');
    expect(daysBetween(p['7d'].period.start, p['7d'].period.end)).toBe(6);
    expect(p['7d'].comparison).toMatchObject({ start: '2026-06-17', end: '2026-06-23' });
    expect(daysBetween(p['30d'].period.start, p['30d'].period.end)).toBe(29);
    expect(daysBetween(p['30d'].comparison.start, p['30d'].comparison.end)).toBe(29);
    expect(daysBetween(p['30d'].comparison.end, p['30d'].period.start)).toBe(1);
  });

  it('gives every period a label the owner can read', () => {
    expect(chatPeriods(TODAY).map(p => p.label)).toEqual(['This month so far', 'Last month', 'Last 7 days', 'Last 30 days']);
  });
});

describe('trimHistory', () => {
  it('keeps the last few turns', () => {
    const turns = Array.from({ length: 7 }, (_, i) => ({ question: `q${i}`, answer: `a${i}` }));
    const kept = trimHistory(turns);
    expect(kept).toHaveLength(CHAT_MAX_HISTORY_TURNS);
    expect(kept[kept.length - 1].question).toBe('q6');
    expect(trimHistory(turns.slice(0, 2))).toHaveLength(2);
  });
});
