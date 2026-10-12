import React, { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { LEGACY_DEFAULT_COLOUR, STOCKPOT_TEAL, themePrimary } from '../utils/themeColour';

/**
 * The brand colour, in Settings › App Customisation: a few swatches, a Custom circle that opens the device's colour picker,
 * and a box to type a hex code (a brand's own colour, or a phone browser with no colour picker, where `<input type="color">`
 * is only a text box). The colour chosen is ringed, a custom one included, and a preview shows a button as the app will
 * draw it: a colour too light for white text is darkened a little (utils/themeColour), and the preview says so.
 */
export const BRAND_SWATCHES = ['#00797B', '#006143', '#1FA97A', '#2563EB', '#7C3AED', '#2B313D', '#E4536B', '#F59E0B'];

const HEX6 = /^#[0-9a-f]{6}$/i;

/** "#f60", "f60", "#FF6600" or "ff6600" as "#FF6600"; null when it is not a hex colour. */
export function normaliseHex(input: string): string | null {
  const s = input.trim().replace(/^#?/, '#');
  if (/^#[0-9a-f]{3}$/i.test(s)) return `#${s.slice(1).split('').map(c => c + c).join('')}`.toUpperCase();
  return HEX6.test(s) ? s.toUpperCase() : null;
}

const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export const BrandColourPicker: React.FC<{ value: string | undefined; onChange: (hex: string) => void }> = ({ value, onChange }) => {
  // The old default green means "not chosen" (the app stays Stockpot teal), so it is shown as teal.
  const current = value && HEX6.test(value) && !same(value, LEGACY_DEFAULT_COLOUR) ? value : STOCKPOT_TEAL;
  const isSwatch = BRAND_SWATCHES.some(c => same(c, current));
  const applied = themePrimary(current);
  const [typed, setTyped] = useState(current.toUpperCase());
  // A colour chosen another way (a swatch, the device picker) replaces what is in the code box.
  const [shown, setShown] = useState(current);
  if (shown !== current) { setShown(current); setTyped(current.toUpperCase()); }
  const typedValid = normaliseHex(typed);

  const commitTyped = () => {
    if (typedValid && !same(typedValid, current)) onChange(typedValid);
    else setTyped(current.toUpperCase());
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Brand colour">
        {BRAND_SWATCHES.map(color => {
          const on = same(color, current);
          return (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(color)}
              aria-label={`Use ${color}`}
              className={`w-10 h-10 rounded-full border-4 transition-transform hover:scale-110 shadow-sm flex items-center justify-center ${on ? 'border-white ring-2 ring-ink/70 scale-110 shadow-md' : 'border-transparent'}`}
              style={{ backgroundColor: color }}
            >
              {on && <Check size={16} className="text-white" />}
            </button>
          );
        })}
        <label
          className={`relative w-10 h-10 rounded-full border-4 cursor-pointer transition-transform hover:scale-110 shadow-sm flex items-center justify-center ${!isSwatch ? 'border-white ring-2 ring-ink/70 scale-110 shadow-md' : 'border-transparent'}`}
          style={{ background: isSwatch ? 'conic-gradient(#ef4444, #f59e0b, #eab308, #22c55e, #06b6d4, #3b82f6, #a855f7, #ef4444)' : current }}
          title="Pick any colour"
        >
          {isSwatch ? <Plus size={18} className="text-white drop-shadow" /> : <Check size={16} className="text-white" />}
          <input
            type="color"
            aria-label="Custom colour"
            value={current.toLowerCase()}
            onChange={e => { const hex = normaliseHex(e.target.value); if (hex) onChange(hex); }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="brand-hex" className="block text-[11px] font-semibold text-muted mb-1">Or type a colour code</label>
          <input
            id="brand-hex"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            onBlur={commitTyped}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitTyped(); } }}
            placeholder="#00797B"
            maxLength={7}
            spellCheck={false}
            aria-invalid={typed.trim() !== '' && !typedValid}
            className={`w-32 rounded-lg border bg-white px-3 py-2 font-mono text-sm uppercase outline-none focus:ring-2 focus:ring-primary/20 ${typed.trim() !== '' && !typedValid ? 'border-coral' : 'border-stone-200 focus:border-primary'}`}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm" style={{ backgroundColor: applied }} aria-label="Preview of a button">
            Buttons look like this
          </span>
        </div>
      </div>
      {!same(applied, current) && (
        <p className="text-xs text-muted">
          {current.toUpperCase()} is shown a little darker in the app ({applied}) so white text on buttons stays readable. Shared nutrition cards use it as chosen.
        </p>
      )}
    </div>
  );
};
