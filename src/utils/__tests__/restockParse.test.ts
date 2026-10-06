import { describe, it, expect } from 'vitest';
import { validateParsedRestock, prepareRestockText, buildRestockDraft } from '../restockParse';

const line = (over: Record<string, any> = {}): any => ({ nameAsWritten: 'butter', materialId: 'butter', quantity: 5, unit: 'kg', total: 2000, pricePerUnit: null, ...over });
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
