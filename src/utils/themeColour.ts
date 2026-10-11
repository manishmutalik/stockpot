/**
 * themeColour.ts
 *
 * The owner's brand colour (Settings › App Customisation), turned into the app's theme: the `--color-primary` family that every
 * `bg-primary` / `text-primary` / `ring-primary` class reads (see the @theme block in src/index.css). Pure, so it is tested.
 *
 * Three rules keep it safe:
 *  - The colour every account was saved with before this worked (#10b981, the original default) means "not chosen", and so does
 *    anything that is not a 6-digit hex colour: the app keeps Stockpot's own teal.
 *  - White text sits on the primary colour (buttons, active tabs), so a colour too light for it is darkened just enough to read
 *    (contrast 4.5:1). The colour as picked is still what the shared nutrition cards use.
 *  - The hover shade and the light tint are worked out from it, so the whole set changes together.
 */

/** Stockpot's own teal, as in src/index.css. */
export const STOCKPOT_TEAL = '#00797B';
/** The default every account was created with before the colour themed the app. Treated as "not chosen". */
export const LEGACY_DEFAULT_COLOUR = '#10b981';

const HEX = /^#[0-9a-f]{6}$/i;

type Rgb = [number, number, number];

const toRgb = (hex: string): Rgb => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const toHex = (rgb: Rgb): string => `#${rgb.map(c => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
const mix = (a: Rgb, b: Rgb, t: number): Rgb => a.map((c, i) => c + (b[i] - c) * t) as Rgb;

/** WCAG relative luminance. */
function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Contrast of white text on this colour. */
export const contrastWithWhite = (hex: string): number => 1.05 / (luminance(toRgb(hex)) + 0.05);

/** The colour the app should use as its primary: the owner's, readable under white text, or Stockpot teal when none was chosen. */
export function themePrimary(chosen: string | undefined | null): string {
  if (!chosen || !HEX.test(chosen.trim()) || chosen.trim().toLowerCase() === LEGACY_DEFAULT_COLOUR) return STOCKPOT_TEAL;
  let rgb = toRgb(chosen.trim());
  // Darken in small steps towards black until white text reads on it.
  for (let i = 0; i < 40 && contrastWithWhite(toHex(rgb)) < 4.5; i++) rgb = mix(rgb, [0, 0, 0], 0.05);
  return toHex(rgb);
}

/** The CSS variables to set on the page for a chosen colour. Stockpot teal gives Stockpot's own values. */
export function themeVariables(chosen: string | undefined | null): Record<string, string> {
  const primary = themePrimary(chosen);
  if (primary === STOCKPOT_TEAL) {
    return { '--color-primary': '#00797B', '--color-primary-dark': '#006365', '--color-primary-light': '#7BD5D7', '--color-accent': '#EAF4F3', '--color-surface': '#EAF4F3' };
  }
  const rgb = toRgb(primary);
  const tint = toHex(mix(rgb, [255, 255, 255], 0.9));
  return {
    '--color-primary': primary,
    '--color-primary-dark': toHex(mix(rgb, [0, 0, 0], 0.18)),
    '--color-primary-light': toHex(mix(rgb, [255, 255, 255], 0.5)),
    '--color-accent': tint,
    '--color-surface': tint,
  };
}

export const THEME_VARIABLE_NAMES = Object.keys(themeVariables(null));
