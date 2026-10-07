import { describe, it, expect } from 'vitest';
import { validateParsedRestock, prepareRestockText, buildRestockDraft, previewRestock, numberOccurrences } from '../restockParse';

const line = (over: Record<string, any> = {}): any => ({ nameAsWritten: 'butter', materialId: 'butter', quantity: 5, unit: 'kg', total: 2000, pricePerUnit: null, priceUnit: null, ...over });
const check = (text: string, l: Record<string, any>) => validateParsedRestock({ lines: [line(l)] }, { text, materialIds: ['butter'] });

describe('validateParsedRestock', () => {
  it('accepts numbers, units and names that are written', () => {
    expect(check('bought 5 kg butter for 2000', {}).ok).toBe(true);
    expect(check('bought five kilos butter for 2,000', {}).ok).toBe(true);
    expect(check('bought 5 kgs of butter for 2000', { unit: 'kg' }).ok).toBe(true);
  });

  it('understands half, a quarter, one and a half and a single one', () => {
    expect(check('bought half a kilo butter for 250', { quantity: 0.5, total: 250 }).ok).toBe(true);
    expect(check('bought a quarter kg butter for 125', { quantity: 0.25, total: 125 }).ok).toBe(true);
    expect(check('bought one and a half kg butter for 600', { quantity: 1.5, total: 600 }).ok).toBe(true);
    expect(check('bought a kilo butter for 450', { quantity: 1, total: 450 }).ok).toBe(true);
  });

  it('refuses a number or unit that is not written, and a material that was not sent', () => {
    expect(check('bought 5 kg butter for 2000', { quantity: 6 }).ok).toBe(false);
    expect(check('bought 5 kg butter for 2000', { total: 1500 }).ok).toBe(false);
    expect(check('bought 5 kg butter for 2000', { unit: 'ml' }).ok).toBe(false);
    expect(check('bought 5 kg butter for 2000', { materialId: 'flour' }).ok).toBe(false);
    expect(check('bought 5 kg butter for 2000', { nameAsWritten: 'ghee' }).ok).toBe(false);
    expect(check('bought 5 kg butter for 2000', { quantity: -5 }).ok).toBe(false);
    expect(validateParsedRestock({ lines: [] }, { text: 'x', materialIds: [] }).ok).toBe(false);
    expect(validateParsedRestock('nope', { text: 'x', materialIds: [] }).ok).toBe(false);
  });
});

describe('prepareRestockText', () => {
  it('tidies and removes phone numbers', () => {
    expect(prepareRestockText('bought  5 kg butter\r\n\r\n\r\n\r\ncall 98765 43210')).toBe('bought 5 kg butter\n\ncall [phone]');
  });
});

describe('buildRestockDraft', () => {
  const materials = [{ id: 'butter', name: 'Butter', unit: 'g' }, { id: 'flour', name: 'Flour', unit: 'kg' }];
  const currency = { code: 'INR', symbol: '₹' };
  it('keeps the same material bought twice as two lines', () => {
    const parsed = { lines: [line(), line({ quantity: 2, total: 800 })] };
    const built = buildRestockDraft({ parsed, materials, answers: new Map(), currency });
    expect(built.draft.lines).toHaveLength(2);
    expect(built.questions).toEqual([]);
  });
  it('ignores an answer that is not one of the materials or fitting units', () => {
    const parsed = { lines: [line({ materialId: null, nameAsWritten: 'ghee' })] };
    expect(buildRestockDraft({ parsed, materials, answers: new Map([['material:0', 'nope']]), currency }).questions).toHaveLength(1);
    const noUnit = { lines: [line({ unit: null })] };
    expect(buildRestockDraft({ parsed: noUnit, materials, answers: new Map([['unit:0', 'ml']]), currency }).questions).toHaveLength(1);
  });
});

describe('a price per unit is read against the unit it is written with', () => {
  const khapli = { id: 'khapli', name: 'Khapli flour', unit: 'kg' };
  const currency = { code: 'INR', symbol: '₹' };
  const read = (text: string, l: Record<string, any>) => {
    const one = line({ nameAsWritten: 'khapli flour', materialId: 'khapli', ...l });
    const v = validateParsedRestock({ lines: [one] }, { text, materialIds: [one.materialId] });
    if (v.ok === false) throw new Error(v.problems.join('; '));
    return v.parsed;
  };
  const draftOf = (text: string, l: Record<string, any>, material = khapli) =>
    buildRestockDraft({ parsed: read(text, l), materials: [material], answers: new Map(), currency });

  it('500 gm at Rs.185/kg is 92.50 for the line, not 92,500', () => {
    const text = '500gm khapli flour at Rs.185/kg';
    const parsed = read(text, { quantity: 500, unit: 'g', total: null, pricePerUnit: 185 });
    expect(parsed.lines[0]).toMatchObject({ pricePerUnit: 185, priceUnit: 'kg' });
    const built = buildRestockDraft({ parsed, materials: [khapli], answers: new Map(), currency });
    expect(built.questions).toEqual([]);
    expect(built.draft.lines).toEqual([{ materialId: 'khapli', quantity: 500, unit: 'g', total: 92.5 }]);
  });

  it('comes out as 185 a kg once saved, whatever was on hand', () => {
    const built = draftOf('500gm khapli flour at Rs.185/kg', { quantity: 500, unit: 'g', total: null, pricePerUnit: 185 });
    const material: any = { ...khapli, initialStock: 0, costPerUnit: 0, category: 'Raw Materials', dateAdded: '2026-01-01' };
    const preview = previewRestock({ draft: built.draft, materials: [material], menu: [], currency });
    if (preview.ok === false) throw new Error(preview.message);
    expect(preview.total).toBe(92.5);
    expect(preview.lines[0]).toMatchObject({ newCost: 185, costUnit: 'kg', newStock: 0.5 });
  });

  it('puts the quantity into the unit the price is per, in every direction', () => {
    const cases: [string, Record<string, any>, { unit: string }, number][] = [
      ['5 kg butter at 400/kg', { quantity: 5, unit: 'kg', pricePerUnit: 400 }, { unit: 'kg' }, 2000],
      ['5 kg butter at 0.4 per g', { quantity: 5, unit: 'kg', pricePerUnit: 0.4 }, { unit: 'kg' }, 2000],
      ['250 g butter at 400 a kg', { quantity: 250, unit: 'g', pricePerUnit: 400 }, { unit: 'kg' }, 100],
      ['2 l oil at 0.18 per ml', { quantity: 2, unit: 'l', pricePerUnit: 0.18 }, { unit: 'l' }, 360],
      ['750 ml oil at 180 per litre', { quantity: 750, unit: 'ml', pricePerUnit: 180 }, { unit: 'l' }, 135],
      ['750ml oil at Rs 180/l', { quantity: 750, unit: 'ml', pricePerUnit: 180 }, { unit: 'l' }, 135],
      ['1500 g butter at 400 per kilo', { quantity: 1500, unit: 'g', pricePerUnit: 400 }, { unit: 'kg' }, 600],
    ];
    for (const [text, over, mat, expected] of cases) {
      const isOil = text.includes('oil');
      const material = isOil ? { id: 'butter', name: 'Oil', unit: mat.unit } : { id: 'butter', name: 'Butter', unit: mat.unit };
      const built = buildRestockDraft({ parsed: read(text, { materialId: 'butter', nameAsWritten: isOil ? 'oil' : 'butter', total: null, ...over }), materials: [material], answers: new Map(), currency });
      expect(built.questions, text).toEqual([]);
      expect(built.draft.lines[0].total, text).toBe(expected);
    }
  });

  it('treats a rate the model put in the total field as a rate', () => {
    const text = '500gm khapli flour at Rs.185/kg';
    const parsed = read(text, { quantity: 500, unit: 'g', total: 185, pricePerUnit: null });
    expect(parsed.lines[0]).toMatchObject({ total: null, pricePerUnit: 185, priceUnit: 'kg' });
    expect(draftOf(text, { quantity: 500, unit: 'g', total: 185, pricePerUnit: null }).draft.lines[0].total).toBe(92.5);
  });

  it('keeps a real total, even when the same number is also a rate elsewhere in the note', () => {
    const text = 'bought 5 kg butter for 400, last time it was 400/kg';
    expect(read(text, { nameAsWritten: 'butter', materialId: 'butter', quantity: 5, unit: 'kg', total: 400 }).lines[0]).toMatchObject({ total: 400, pricePerUnit: null });
  });

  it('asks what was paid when the rate has no unit written beside it', () => {
    const text = '500 gm khapli flour at 185 rupees';
    const parsed = read(text, { quantity: 500, unit: 'g', total: null, pricePerUnit: 185 });
    expect(parsed.lines[0]).toMatchObject({ pricePerUnit: null, priceUnit: null });
    const built = buildRestockDraft({ parsed, materials: [khapli], answers: new Map(), currency });
    expect(built.draft.lines).toEqual([]);
    expect(built.questions).toEqual([expect.objectContaining({ id: 'total:0', type: 'amount' })]);
  });

  it('does not take the unit from the model: a rate written per kg stays per kg even if the model says per g', () => {
    const parsed = read('500 gm khapli flour at 185/kg', { quantity: 500, unit: 'g', total: null, pricePerUnit: 185, priceUnit: 'g' });
    expect(parsed.lines[0].priceUnit).toBe('kg');
  });

  it('a total written with its quantity is untouched: 500 g for 92.50', () => {
    expect(draftOf('500 gm khapli flour for 92.50', { quantity: 500, unit: 'g', total: 92.5 }).draft.lines[0]).toMatchObject({ total: 92.5 });
  });

  it('finds the unit a number is quoted per, and none for a plain amount', () => {
    expect(numberOccurrences(185, 'at Rs.185/kg')).toEqual([{ rateUnit: 'kg' }]);
    expect(numberOccurrences(185, 'at 185 per kilo')).toEqual([{ rateUnit: 'kg' }]);
    expect(numberOccurrences(185, 'at 185 a kg')).toEqual([{ rateUnit: 'kg' }]);
    expect(numberOccurrences(185, '185/- per kg')).toEqual([{ rateUnit: 'kg' }]);
    expect(numberOccurrences(185, 'at ₹185/ltr')).toEqual([{ rateUnit: 'l' }]);
    expect(numberOccurrences(1850, 'paid 1,850 for it')).toEqual([{ rateUnit: null }]);
    expect(numberOccurrences(185, '5 kg for 185 total')).toEqual([{ rateUnit: null }]);
    expect(numberOccurrences(50, 'paid 150')).toEqual([]);
  });
});
