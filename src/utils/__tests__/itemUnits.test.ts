import { describe, it, expect } from 'vitest';
import { formatItemQuantity, fromEntry, isByMeasure, itemUnit, perUnit, smallUnit, toEntry, unitWord } from '../itemUnits';

describe('itemUnits', () => {
  it('knows the unit an item is counted in', () => {
    expect(itemUnit({ countedIn: 'kg' })).toBe('kg');
    expect(itemUnit({ countedIn: 'l' })).toBe('l');
    expect(itemUnit({})).toBe('pcs');
    expect(itemUnit({ countedIn: 'bags' as never })).toBe('pcs');
    expect(itemUnit(undefined)).toBe('pcs');
    expect(isByMeasure({ countedIn: 'kg' })).toBe(true);
    expect(isByMeasure({})).toBe(false);
  });

  it('says quantities as they are said: grams below a kilo, kilos above', () => {
    expect(formatItemQuantity('kg', 0.15)).toBe('150 g');
    expect(formatItemQuantity('kg', 1.2)).toBe('1.2 kg');
    expect(formatItemQuantity('kg', 1)).toBe('1 kg');
    expect(formatItemQuantity('l', 0.3)).toBe('300 ml');
    expect(formatItemQuantity('l', 2.5)).toBe('2.5 l');
    expect(formatItemQuantity('pcs', 4.5)).toBe('4.5');
    expect(formatItemQuantity('kg', -0.2)).toBe('-200 g');
  });

  it('names units', () => {
    expect(unitWord('pcs', 1)).toBe('piece');
    expect(unitWord('pcs', 3)).toBe('pieces');
    expect(unitWord('l', 2)).toBe('litres');
    expect(unitWord('kg', 2)).toBe('kg');
    expect(perUnit('kg')).toBe('per kg');
    expect(perUnit('pcs')).toBe('per piece');
    expect(smallUnit('kg')).toBe('g');
    expect(smallUnit('pcs')).toBeNull();
  });

  it('types amounts of a measured item in grams and keeps them in kilos', () => {
    expect(toEntry('kg', 0.15)).toBe(150);
    expect(fromEntry('kg', 150)).toBe(0.15);
    expect(fromEntry('l', 75)).toBe(0.075);
    expect(toEntry('pcs', 0.5)).toBe(0.5);
    expect(fromEntry('pcs', 2)).toBe(2);
  });
});
