import { describe, it, expect } from 'vitest';
import { contrastWithWhite, LEGACY_DEFAULT_COLOUR, STOCKPOT_TEAL, themePrimary, themeVariables, THEME_VARIABLE_NAMES } from '../themeColour';

describe('the brand colour as the app theme', () => {
  it('keeps Stockpot teal when no colour was chosen, including the old default every account was saved with', () => {
    for (const c of [undefined, null, '', LEGACY_DEFAULT_COLOUR, '#10B981', 'teal', '#abc', 'url(x)']) expect(themePrimary(c)).toBe(STOCKPOT_TEAL);
    expect(themeVariables(LEGACY_DEFAULT_COLOUR)).toEqual({
      '--color-primary': '#00797B', '--color-primary-dark': '#006365', '--color-primary-light': '#7BD5D7', '--color-accent': '#EAF4F3', '--color-surface': '#EAF4F3',
    });
  });

  it('uses a chosen colour as it is when white text already reads on it', () => {
    expect(themePrimary('#2563eb')).toBe('#2563EB');
    expect(themePrimary('#2B313D')).toBe('#2B313D');
  });

  it('darkens a light colour just enough for white text (4.5:1)', () => {
    const amber = themePrimary('#F59E0B');
    expect(amber).not.toBe('#F59E0B');
    expect(contrastWithWhite(amber)).toBeGreaterThanOrEqual(4.5);
    expect(contrastWithWhite(themePrimary('#FFFFFF'))).toBeGreaterThanOrEqual(4.5);
  });

  it('works out the hover shade and the tints from it, and sets every variable it can clear', () => {
    const v = themeVariables('#2563EB');
    expect(v['--color-primary']).toBe('#2563EB');
    expect(contrastWithWhite(v['--color-primary-dark'])).toBeGreaterThan(contrastWithWhite('#2563EB'));
    expect(v['--color-accent']).toBe(v['--color-surface']);
    expect(Object.keys(v).sort()).toEqual([...THEME_VARIABLE_NAMES].sort());
  });
});
