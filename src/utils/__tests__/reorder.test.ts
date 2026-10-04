import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LEAD_TIME_DAYS, DEFAULT_SAFETY_DAYS, HIGH_VARIATION, LOW_CONFIDENCE_HISTORY_DAYS, MIN_HISTORY_DAYS, RECENT_DAYS, REVIEW_DAYS,
  reorderSuggestions, roundUpSignificant, USAGE_WINDOW_DAYS,
} from '../reorder';
import { addDays } from '../localDate';

const TODAY = '2026-10-04';
const ago = (n: number) => addDays(TODAY, -n);

const flour = (over: Record<string, any> = {}) => ({ id: 'flour', name: 'Flour', unit: 'kg', threshold: 0, dateAdded: ago(60), remaining: 10, ...over });
const menu = [
  { id: 'loaf', recipe: [{ materialId: 'flour', amount: 500, unit: 'g' }] },
  { id: 'cake', recipe: [{ materialId: 'flour', amount: 0.2, unit: 'kg' }, { materialId: 'butter', amount: 100, unit: 'g' }] },
];
const run = (daysAgo: number, quantityProduced: number, recipeId = 'loaf') => ({ recipeId, quantityProduced, date: ago(daysAgo) });
/** A run of loaves every day for the last `days` days: `perDay` loaves, so perDay x 0.5 kg of flour a day. */
const steady = (days: number, perDay: number) => Array.from({ length: days }, (_, i) => run(i, perDay));
const compute = (over: Record<string, any> = {}) => reorderSuggestions({
  materials: [flour()], menu, productionRuns: steady(28, 4), wastageLogs: [], today: TODAY, ...over,
});
const only = (over: Record<string, any> = {}) => compute(over).suggestions[0];

describe('the rules, as named constants', () => {
  it('are the documented ones', () => {
    expect([USAGE_WINDOW_DAYS, RECENT_DAYS, MIN_HISTORY_DAYS, LOW_CONFIDENCE_HISTORY_DAYS]).toEqual([28, 7, 7, 14]);
    expect([DEFAULT_LEAD_TIME_DAYS, DEFAULT_SAFETY_DAYS, REVIEW_DAYS, HIGH_VARIATION]).toEqual([2, 2, 7, 1]);
  });
});

describe('roundUpSignificant', () => {
  it('rounds up to two significant figures', () => {
    expect(roundUpSignificant(2.34)).toBe(2.4);
    expect(roundUpSignificant(1234)).toBe(1300);
    expect(roundUpSignificant(0.0123)).toBe(0.013);
    expect(roundUpSignificant(99.1)).toBe(100);
    expect(roundUpSignificant(7)).toBe(7);
    expect(roundUpSignificant(12)).toBe(12);
  });

  it('does not round up a number that is already exact, despite floating point', () => {
    expect(roundUpSignificant(2.4)).toBe(2.4);
    expect(roundUpSignificant(0.1 + 0.2)).toBe(0.3);
    expect(roundUpSignificant(1.1 * 3)).toBe(3.3);
  });

  it('gives zero for zero or less', () => {
    expect(roundUpSignificant(0)).toBe(0);
    expect(roundUpSignificant(-5)).toBe(0);
  });
});

describe('when a material is flagged', () => {
  // 4 loaves a day x 500 g = 2 kg a day. Lead 2 + safety 2 = 4 days of cover is the line.
  it('is flagged at exactly lead plus safety days of cover, and not a hair above', () => {
    expect(only({ materials: [flour({ remaining: 8 })] })).toMatchObject({ materialId: 'flour', daysOfCover: 4 });
    expect(compute({ materials: [flour({ remaining: 8.01 })] }).suggestions).toHaveLength(0);
    expect(compute({ materials: [flour({ remaining: 7 })] }).suggestions).toHaveLength(1);
  });

  it('works out the rate, the cover and the run-out date', () => {
    const s = only({ materials: [flour({ remaining: 6 })] });
    expect(s.rate).toBeCloseTo(2, 6);
    expect(s.daysOfCover).toBeCloseTo(3, 6);
    expect(s.runOutDate).toBe(addDays(TODAY, 3));
    expect(s).toMatchObject({ name: 'Flour', unit: 'kg', stock: 6, historyDays: 60 });
  });

  it('suggests enough for the review period plus lead and safety, less what is on hand', () => {
    // 2 kg a day x (7 + 2 + 2) days = 22 kg, less 6 on hand = 16.
    expect(only({ materials: [flour({ remaining: 6 })] }).suggestedQty).toBe(16);
  });

  it('rounds the suggested quantity up to two significant figures', () => {
    // 2 kg/day x 11 = 22, minus 0.7 on hand = 21.3, rounded up to 22.
    expect(only({ materials: [flour({ remaining: 0.7 })] }).suggestedQty).toBe(22);
    // 3 loaves a day = 1.5 kg a day x 11 = 16.5, minus 2.3 = 14.2, rounded up to 15.
    expect(only({ materials: [flour({ remaining: 2.3 })], productionRuns: steady(28, 3) }).suggestedQty).toBe(15);
  });

  it('uses a material\'s own lead time instead of the default', () => {
    expect(compute({ materials: [flour({ remaining: 10 })] }).suggestions).toHaveLength(0); // 5 days of cover
    const long = only({ materials: [flour({ remaining: 10, leadTimeDays: 5 })] }); // line is 5 + 2 = 7 days
    expect(long).toBeTruthy();
    expect(long.suggestedQty).toBe(18); // 2 kg a day x (7 review + 5 lead + 2 safety) = 28, less 10 on hand
  });

  it('puts the one that runs out first at the top', () => {
    const r = compute({
      materials: [flour({ id: 'a', name: 'Alpha', remaining: 7 }), flour({ id: 'b', name: 'Beta', remaining: 2 })],
      menu: [{ id: 'loaf', recipe: [{ materialId: 'a', amount: 500, unit: 'g' }, { materialId: 'b', amount: 500, unit: 'g' }] }],
    });
    expect(r.suggestions.map(s => s.materialId)).toEqual(['b', 'a']);
  });
});

describe('how use is counted', () => {
  it('converts the recipe\'s unit to the material\'s (a recipe in grams, stock in kilos)', () => {
    const s = only({ materials: [flour({ remaining: 1 })], productionRuns: [run(0, 10)] , });
    // History is 60 days from dateAdded, 28-day window: 10 loaves x 0.5 kg = 5 kg / 28 days = 0.18/day,
    // but the last 7 days used all 5 kg: 5 / 7 = 0.714 kg a day, the larger.
    expect(s.rate).toBeCloseTo(5 / 7, 6);
  });

  it('counts a recipe in kilos against stock in kilos, and in a unit it cannot convert as it is', () => {
    const r = only({ materials: [flour({ remaining: 1 })], productionRuns: steady(28, 5).map(x => ({ ...x, recipeId: 'cake' })) });
    expect(r.rate).toBeCloseTo(1, 6); // 5 cakes x 0.2 kg
  });

  it('counts discards of the material as use', () => {
    const none = compute({ materials: [flour({ remaining: 4 })], productionRuns: [] , wastageLogs: [] });
    expect(none.suggestions).toHaveLength(0);
    const logs = Array.from({ length: 28 }, (_, i) => ({ type: 'material' as const, itemId: 'flour', quantity: 1, date: ago(i) }));
    const s = only({ materials: [flour({ remaining: 4 })], productionRuns: [], wastageLogs: logs });
    expect(s.rate).toBeCloseTo(1, 6);
  });

  it('does not count discards of finished products, or of other materials', () => {
    const logs = [
      { type: 'recipe' as const, itemId: 'flour', quantity: 100, date: ago(1) },
      { type: 'material' as const, itemId: 'sugar', quantity: 100, date: ago(1) },
    ];
    expect(compute({ materials: [flour({ remaining: 0 })], productionRuns: [], wastageLogs: logs }).suggestions).toHaveLength(0);
  });

  it('does not count a restock: stock on hand is what it is, and nothing here reads restocks', () => {
    // The same runs and the same stock give the same answer whatever was bought: only `remaining` matters.
    expect(only({ materials: [flour({ remaining: 6 })] })).toEqual(only({ materials: [flour({ remaining: 6, initialStock: 99 })] }));
  });

  it('does not count R&D: only production runs and discards are inputs', () => {
    const r = reorderSuggestions({ materials: [flour({ remaining: 0 })], menu, productionRuns: [], wastageLogs: [], today: TODAY, ...({ experiments: [{ id: 'x' }] } as any) });
    expect(r.suggestions).toHaveLength(0);
  });

  it('ignores a run in the future and a run for a recipe that is no longer on the menu', () => {
    const s = compute({ materials: [flour({ remaining: 0 })], productionRuns: [run(-3, 50), run(2, 10, 'deleted-recipe')] });
    expect(s.suggestions).toHaveLength(0);
  });

  it('ignores use older than the window', () => {
    const r = compute({ materials: [flour({ remaining: 0 })], productionRuns: [run(40, 100)] });
    expect(r.suggestions).toHaveLength(0);
  });
});

describe('a busy last week', () => {
  it('raises the rate above the 28-day average', () => {
    // 2 loaves a day for three weeks, then 8 a day for the last week.
    const runs = [...Array.from({ length: 21 }, (_, i) => run(i + 7, 2)), ...steady(7, 8)];
    const s = only({ materials: [flour({ remaining: 1 })], productionRuns: runs });
    const rate28 = (21 * 2 * 0.5 + 7 * 8 * 0.5) / 28;
    expect(rate28).toBeCloseTo(1.75, 6);
    expect(s.rate).toBeCloseTo(4, 6); // 8 x 0.5 kg: the busy week, not the average
  });

  it('keeps the 28-day average when the last week was quiet', () => {
    const runs = [...Array.from({ length: 21 }, (_, i) => run(i + 7, 8)), ...steady(7, 1)];
    expect(only({ materials: [flour({ remaining: 1 })], productionRuns: runs }).rate).toBeCloseTo((21 * 8 * 0.5 + 7 * 0.5) / 28, 6);
  });
});

describe('history', () => {
  it('gives no suggestion, and says why, with fewer than 7 days of history', () => {
    const r = compute({ materials: [flour({ remaining: 0, dateAdded: ago(6) })], productionRuns: steady(6, 4) });
    expect(r.suggestions).toHaveLength(0);
    expect(r.notEnoughHistory).toEqual(['flour']);
  });

  it('suggests from exactly 7 days of history, using the days it has', () => {
    const r = compute({ materials: [flour({ remaining: 2, dateAdded: ago(7) })], productionRuns: steady(7, 4) });
    expect(r.notEnoughHistory).toEqual([]);
    expect(r.suggestions[0].rate).toBeCloseTo(2, 6); // 14 kg over 7 days, not over 28
    expect(r.suggestions[0].historyDays).toBe(7);
  });

  it('counts history from the first use when that is earlier than the date added', () => {
    const r = compute({ materials: [flour({ remaining: 0, dateAdded: ago(2) })], productionRuns: steady(10, 4) });
    expect(r.suggestions).toHaveLength(1);
    expect(r.suggestions[0].historyDays).toBe(9);
  });

  it('does not list a material that is never used as lacking history', () => {
    const r = compute({ materials: [flour({ id: 'unused', name: 'Unused', dateAdded: ago(1), remaining: 0 })], productionRuns: [] });
    expect(r.suggestions).toHaveLength(0);
    expect(r.notEnoughHistory).toEqual([]);
  });
});

describe('the flag', () => {
  it('is before_threshold while stock is still above the alert level', () => {
    expect(only({ materials: [flour({ remaining: 6, threshold: 3 })] }).flag).toBe('before_threshold');
  });

  it('is at_threshold once stock is at or below it, so the existing alert covers it', () => {
    expect(only({ materials: [flour({ remaining: 3, threshold: 3 })] }).flag).toBe('at_threshold');
    expect(only({ materials: [flour({ remaining: 2, threshold: 3 })] }).flag).toBe('at_threshold');
  });

  it('is before_threshold when no alert level is set', () => {
    expect(only({ materials: [flour({ remaining: 3, threshold: 0 })] }).flag).toBe('before_threshold');
    expect(only({ materials: [flour({ remaining: 3, threshold: undefined })] }).flag).toBe('before_threshold');
  });
});

describe('confidence', () => {
  it('is normal with enough history and steady use', () => {
    expect(only({ materials: [flour({ remaining: 6 })] }).confidence).toBe('normal');
  });

  it('is low with fewer than 14 days of history', () => {
    expect(only({ materials: [flour({ remaining: 2, dateAdded: ago(10) })], productionRuns: steady(10, 4) }).confidence).toBe('low');
    expect(only({ materials: [flour({ remaining: 2, dateAdded: ago(14) })], productionRuns: steady(14, 4) }).confidence).toBe('normal');
  });

  it('is low when daily use swings a lot', () => {
    // One big batch a week: a lot of zero days and a few huge ones.
    const runs = [0, 7, 14, 21].map(d => run(d, 28));
    expect(only({ materials: [flour({ remaining: 1 })], productionRuns: runs }).confidence).toBe('low');
  });
});

describe('edge cases', () => {
  it('treats zero or negative stock as no cover left, and suggests a full order', () => {
    const empty = only({ materials: [flour({ remaining: 0 })] });
    expect(empty).toMatchObject({ daysOfCover: 0, runOutDate: TODAY, stock: 0, suggestedQty: 22 });
    const negative = only({ materials: [flour({ remaining: -3 })] });
    expect(negative).toMatchObject({ daysOfCover: 0, stock: 0, suggestedQty: 22 });
  });

  it('never flags a material with no use in the window', () => {
    expect(compute({ materials: [flour({ remaining: 0 })], productionRuns: [] }).suggestions).toEqual([]);
  });

  it('copes with no materials, no menu and no runs', () => {
    expect(reorderSuggestions({ materials: [], menu: [], productionRuns: [], wastageLogs: [], today: TODAY })).toEqual({ suggestions: [], notEnoughHistory: [] });
  });

  it('copes with a recipe that is missing or has a material that was deleted', () => {
    const r = compute({ menu: [{ id: 'loaf', recipe: undefined as any }, { id: 'cake', recipe: [{ materialId: 'gone', amount: 1, unit: 'kg' }] }], productionRuns: steady(28, 4).map((x, i) => ({ ...x, recipeId: i % 2 ? 'cake' : 'loaf' })) });
    expect(r.suggestions).toEqual([]);
  });
});
