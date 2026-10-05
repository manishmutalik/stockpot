import React, { useState } from 'react';

/**
 * A number field that saves when the owner is done typing (on blur or Enter), not on every keystroke. A price
 * saved per keystroke would write "6" on the way to "650", and every write stamps the item's pricing baseline,
 * so the stamp has to describe the final price.
 */
export const PriceInput: React.FC<{
  value: number;
  /** Called once with the final number, and only if it changed. */
  onCommit: (value: number) => void;
  ariaLabel: string;
  className?: string;
  placeholder?: string;
  step?: string;
  /** Show an empty field for 0 (so a placeholder can show), instead of "0". */
  blankWhenZero?: boolean;
}> = ({ value, onCommit, ariaLabel, className, placeholder, step = '0.01', blankWhenZero }) => {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = parseFloat(draft) || 0;
    setDraft(null);
    if (n !== value) onCommit(n);
  };
  return (
    <input
      type="number"
      step={step}
      min="0"
      aria-label={ariaLabel}
      value={draft ?? (blankWhenZero && !value ? '' : String(value ?? 0))}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      className={className}
      placeholder={placeholder}
    />
  );
};
