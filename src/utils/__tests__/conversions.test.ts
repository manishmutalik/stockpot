import { describe, it, expect } from 'vitest';
import { convertAmount, enterableUnits } from '../conversions';
import { getDefaultRecipeUnit } from '../../types';

describe('convertAmount', () => {
  it('returns the amount unchanged when units match', () => {
    expect(convertAmount(100, 'g', 'g')).toBe(100);
  });

  it('converts kg to g', () => {
    expect(convertAmount(2, 'kg', 'g')).toBe(2000);
  });

  it('converts g to kg', () => {
    expect(convertAmount(500, 'g', 'kg')).toBe(0.5);
  });

  it('converts l to ml', () => {
    expect(convertAmount(1.5, 'l', 'ml')).toBe(1500);
  });

  it('converts ml to l', () => {
    expect(convertAmount(250, 'ml', 'l')).toBe(0.25);
  });

  it('returns the amount unchanged for an unknown unit pair', () => {
    expect(convertAmount(10, 'pcs', 'kg')).toBe(10);
  });

  // Weight <-> volume assumes 1g = 1ml (water's density) — see UNIT_CONVERSIONS'
  // doc comment for why, and its limits for anything denser/lighter than water.
  it('converts g to ml at a 1:1 ratio', () => {
    expect(convertAmount(250, 'g', 'ml')).toBe(250);
  });

  it('converts ml to g at a 1:1 ratio', () => {
    expect(convertAmount(250, 'ml', 'g')).toBe(250);
  });

  it('converts kg to l at a 1:1 ratio', () => {
    expect(convertAmount(2, 'kg', 'l')).toBe(2);
  });

  it('converts l to kg at a 1:1 ratio', () => {
    expect(convertAmount(1.5, 'l', 'kg')).toBe(1.5);
  });

  it('converts across both unit and family (g to l, kg to ml)', () => {
    expect(convertAmount(500, 'g', 'l')).toBe(0.5);
    expect(convertAmount(2, 'kg', 'ml')).toBe(2000);
  });

  it('returns the amount unchanged when either unit is missing', () => {
    expect(convertAmount(10, '', 'g')).toBe(10);
    expect(convertAmount(10, 'g', '')).toBe(10);
  });
});

describe('getDefaultRecipeUnit', () => {
  it('defaults to g when no inventory unit is given', () => {
    expect(getDefaultRecipeUnit(undefined)).toBe('g');
  });

  it('maps weight units (kg, g) to g', () => {
    expect(getDefaultRecipeUnit('kg')).toBe('g');
    expect(getDefaultRecipeUnit('g')).toBe('g');
  });

  it('maps volume units (l, ml) to ml', () => {
    expect(getDefaultRecipeUnit('l')).toBe('ml');
    expect(getDefaultRecipeUnit('ml')).toBe('ml');
  });

  it('is case-insensitive', () => {
    expect(getDefaultRecipeUnit('KG')).toBe('g');
    expect(getDefaultRecipeUnit('L')).toBe('ml');
  });

  it('passes through other units unchanged', () => {
    expect(getDefaultRecipeUnit('pcs')).toBe('pcs');
  });
});

describe('enterableUnits', () => {
  it('offers grams and kilos for a weight, and millilitres and litres for a volume, either way round', () => {
    expect(enterableUnits('kg')).toEqual(['g', 'kg']);
    expect(enterableUnits('g')).toEqual(['g', 'kg']);
    expect(enterableUnits('l')).toEqual(['ml', 'l']);
    expect(enterableUnits('ml')).toEqual(['ml', 'l']);
  });

  it('does not mix weight and volume', () => {
    expect(enterableUnits('kg')).not.toContain('l');
    expect(enterableUnits('ml')).not.toContain('g');
  });

  it('offers only itself for a counted or custom unit', () => {
    expect(enterableUnits('pcs')).toEqual(['pcs']);
    expect(enterableUnits('bunch')).toEqual(['bunch']);
  });
});
