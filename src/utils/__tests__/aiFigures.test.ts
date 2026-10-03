import { describe, it, expect } from 'vitest';
import { AI_TEXT_MAX_CHARS, formatFigure, renderAiText, tokenIds, validateAiText, type AiRegistry } from '../aiFigures';

const ctx = { currencySymbol: '₹' };
const registry: AiRegistry = {
  figures: {
    profit_change: { kind: 'money', value: -2180.4, label: 'Change in true profit', signed: true },
    revenue: { kind: 'money', value: 6240, label: 'Revenue' },
    small: { kind: 'money', value: 45.5, label: 'A small amount' },
    pct: { kind: 'percent', value: -12.3, label: 'Change', signed: true },
    pct_small: { kind: 'percent', value: 5.46, label: 'Small change' },
    orders: { kind: 'count', value: 14, label: 'Orders' },
    quiet: { kind: 'days', value: 1, label: 'Days' },
    busy: { kind: 'days', value: 12, label: 'Days' },
    last: { kind: 'date', value: '2026-10-02', label: 'Date' },
  },
  names: { item_1: 'Chocolate Cake', item_2: '500 g Loaf' },
};
const known = { figures: Object.keys(registry.figures), names: Object.keys(registry.names), customers: ['C-4F2A'] };

describe('formatFigure', () => {
  it('formats money with Indian digit grouping, whole rupees from 100 up and paise below', () => {
    expect(formatFigure(registry.figures.revenue, ctx)).toBe('₹6,240');
    expect(formatFigure({ kind: 'money', value: 1234567, label: '' }, ctx)).toBe('₹12,34,567');
    expect(formatFigure(registry.figures.small, ctx)).toBe('₹45.5');
    expect(formatFigure({ kind: 'money', value: 0.5, label: '' }, ctx)).toBe('₹0.5');
  });

  it('shows a sign on a change, and a minus on any negative', () => {
    expect(formatFigure(registry.figures.profit_change, ctx)).toBe('-₹2,180');
    expect(formatFigure({ kind: 'money', value: 300, label: '', signed: true }, ctx)).toBe('+₹300');
    expect(formatFigure({ kind: 'money', value: 0, label: '', signed: true }, ctx)).toBe('₹0');
    expect(formatFigure({ kind: 'money', value: -50, label: '' }, ctx)).toBe('-₹50');
  });

  it('formats percentages, counts, days and dates', () => {
    expect(formatFigure(registry.figures.pct, ctx)).toBe('-12%');
    expect(formatFigure(registry.figures.pct_small, ctx)).toBe('5.5%');
    expect(formatFigure(registry.figures.orders, ctx)).toBe('14');
    expect(formatFigure(registry.figures.quiet, ctx)).toBe('1 day');
    expect(formatFigure(registry.figures.busy, ctx)).toBe('12 days');
    expect(formatFigure(registry.figures.last, ctx)).toBe('Fri 2 Oct');
  });

  it('uses the currency symbol it is given', () => {
    expect(formatFigure(registry.figures.revenue, { currencySymbol: '$', locale: 'en-US' })).toBe('$6,240');
  });
});

describe('validateAiText', () => {
  const ok = (t: string) => validateAiText(t, known);

  it('accepts words and known tokens', () => {
    expect(ok('Profit fell by {{fig:profit_change}} because {{name:item_1}} sold less.').ok).toBe(true);
    expect(ok('{{cust:C-4F2A}} has not ordered for {{fig:busy}}.').ok).toBe(true);
    expect(ok('Profit is down. One reason: butter.').ok).toBe(true);
  });

  it('refuses any digit outside a token', () => {
    for (const t of ['Profit fell by 12 this week.', 'Down ₹2180.', 'Sold 3 cakes', 'Roughly 12.5', 'Q3 was weak', 'About 1,200']) {
      const r = ok(t);
      expect(r.ok, t).toBe(false);
      expect(r.problems.join()).toMatch(/digit|currency/);
    }
  });

  it('refuses a currency or percent sign outside a token', () => {
    expect(ok('It dropped by a lot %').ok).toBe(false);
    expect(ok('Up in ₹ terms').ok).toBe(false);
    expect(ok('Costs rose $ wise').ok).toBe(false);
  });

  it('refuses spelled-out numbers, which would slip past a digit check', () => {
    for (const t of ['Profit fell twelve percent.', 'Down by two thousand', 'About three cakes', 'A hundred orders', 'Sold a dozen', 'Gained five lakh', 'Up forty per cent']) {
      expect(ok(t).ok, t).toBe(false);
    }
  });

  it('allows ordinary words that merely contain number-like letters', () => {
    expect(ok('Someone phoned about tension at the oven; attentive staff helped.').ok).toBe(true);
    expect(ok('First, second and last: butter, sugar, milk.').ok).toBe(true);
  });

  it('refuses a token for something that is not in the snapshot', () => {
    const r = ok('Fell by {{fig:made_up}}');
    expect(r.ok).toBe(false);
    expect(r.problems).toContain('unknown fig token "made_up"');
    expect(ok('{{name:item_99}}').ok).toBe(false);
    expect(ok('{{cust:C-0000}}').ok).toBe(false);
  });

  it('refuses digits hidden next to or inside a token, and half-formed tokens', () => {
    expect(ok('{{fig:revenue}}0').ok).toBe(false);
    expect(ok('{{fig:revenue').ok).toBe(false);
    expect(ok('{{fig: revenue}}').ok).toBe(false);
    expect(ok('{{fig:revenue}}}}').ok).toBe(false);
    expect(ok('{{unknown:revenue}}').ok).toBe(false);
  });

  it('refuses empty, non-string and overlong text', () => {
    expect(ok('').ok).toBe(false);
    expect(ok('   ').ok).toBe(false);
    expect(validateAiText(undefined, known).ok).toBe(false);
    expect(validateAiText(42, known).ok).toBe(false);
    expect(ok('a '.repeat(AI_TEXT_MAX_CHARS)).ok).toBe(false);
  });

  it('is the same on every call (a global pattern must not keep state)', () => {
    for (let i = 0; i < 5; i++) expect(ok('Fell by {{fig:profit_change}}').ok).toBe(true);
  });
});

describe('renderAiText', () => {
  it('replaces tokens with the application\'s own formatting', () => {
    expect(renderAiText('Profit moved {{fig:profit_change}} ({{fig:pct}}) as {{name:item_2}} sold {{fig:orders}} times.', registry, ctx))
      .toBe('Profit moved -₹2,180 (-12%) as 500 g Loaf sold 14 times.');
  });

  it('shows a customer\'s name from the client-side map', () => {
    expect(renderAiText('{{cust:C-4F2A}} is due.', registry, ctx, { 'C-4F2A': 'Priya Sharma' })).toBe('Priya Sharma is due.');
  });

  it('shows a dash, not braces or a guess, for anything it cannot resolve', () => {
    expect(renderAiText('{{fig:nope}} {{name:nope}} {{cust:C-0000}}', registry, ctx)).toBe('- - -');
  });

  it('leaves ordinary text alone', () => {
    expect(renderAiText('Nothing to see.', registry, ctx)).toBe('Nothing to see.');
  });

  it('can only ever produce numbers the registry holds: text with no valid digits renders to digits only from the registry', () => {
    const text = 'Revenue {{fig:revenue}} and {{fig:orders}} orders.';
    expect(validateAiText(text, known).ok).toBe(true);
    const shown = renderAiText(text, registry, ctx);
    const digitsShown = shown.match(/\d[\d,.]*/g)!.map(d => Number(d.replace(/,/g, '')));
    expect(digitsShown).toEqual([6240, 14]);
  });
});

describe('tokenIds', () => {
  it('lists the tokens in a text', () => {
    expect(tokenIds('a {{fig:x}} b {{name:y}} {{cust:C-1}}')).toEqual([{ kind: 'fig', id: 'x' }, { kind: 'name', id: 'y' }, { kind: 'cust', id: 'C-1' }]);
  });
});
