import { describe, it, expect } from 'vitest';
import { convertAmount } from '../conversions';
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
