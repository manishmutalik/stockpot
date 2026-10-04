import React, { useId, useMemo, useState } from 'react';
import { matchCustomers, type CustomerSuggestion } from '../utils/customers';
import { daysBetween } from '../utils/localDate';

const lastOrderText = (lastOrder: string, today: string) => {
  const days = daysBetween(lastOrder, today);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
};

/**
 * A text input that suggests past customers while the owner types (the ARIA
 * combobox pattern), used for both the name and the phone number in Add Order.
 * Picking a suggestion hands the customer to `onPick`, which fills both fields.
 *
 * Nothing is ever chosen for the owner: the list only opens when they type, the
 * highlight starts on nothing, and Enter only picks a row they moved to, so a
 * new customer's name never silently becomes an existing customer. Rows use
 * mouse-down (not click) so the input's blur does not close the list before a tap
 * lands. The list is a plain absolutely positioned box, not a native datalist,
 * which cannot fill the phone with the name and renders unevenly on phones.
 */
export const CustomerCombobox: React.FC<{
  id: string;
  value: string;
  onChange: (value: string) => void;
  onPick: (customer: CustomerSuggestion) => void;
  directory: CustomerSuggestion[];
  /** Today in the business's time zone, for "12 days ago". */
  today: string;
  placeholder?: string;
  className?: string;
  /** Which edge of the input the list lines up with: the phone field is the last column, so its list opens leftwards. */
  align?: 'left' | 'right';
  'aria-label'?: string;
}> = ({ id, value, onChange, onPick, directory, today, placeholder, className, align = 'left', 'aria-label': ariaLabel }) => {
  const listId = `${useId()}-list`;
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const matches = useMemo(() => matchCustomers(value, directory), [value, directory]);
  const showing = open && matches.length > 0;
  const optionId = (i: number) => `${listId}-${i}`;

  const close = () => { setOpen(false); setHighlight(-1); };
  const pick = (customer: CustomerSuggestion) => { close(); onPick(customer); };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (matches.length === 0) return;
      e.preventDefault();
      setOpen(true);
      const last = matches.length - 1;
      setHighlight(h => (e.key === 'ArrowDown' ? (h >= last ? 0 : h + 1) : h <= 0 ? last : h - 1));
    } else if (e.key === 'Enter') {
      // Only a row the owner moved to is picked, and then Enter must not also do what Enter does in the form.
      if (showing && highlight >= 0 && matches[highlight]) { e.preventDefault(); pick(matches[highlight]); }
    } else if (e.key === 'Escape') {
      if (showing) { e.preventDefault(); e.stopPropagation(); close(); }
    }
  };

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); setHighlight(-1); }}
        onKeyDown={onKeyDown}
        onBlur={close}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={showing}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showing && highlight >= 0 ? optionId(highlight) : undefined}
      />
      <ul
        id={listId}
        role="listbox"
        hidden={!showing}
        className={`absolute top-full mt-1 z-20 w-[min(20rem,calc(100vw-3rem))] max-h-72 overflow-y-auto rounded-xl bg-white shadow-[0_12px_32px_-6px_rgba(43,49,61,0.22)] border border-stone-100 py-1 ${align === 'right' ? 'right-0' : 'left-0'}`}
      >
        {showing && matches.map((c, i) => (
          <li
            key={c.key}
            id={optionId(i)}
            role="option"
            aria-selected={i === highlight}
            // Mouse-down, not click: the input would lose focus (and close the list) first.
            onMouseDown={e => { e.preventDefault(); pick(c); }}
            onMouseEnter={() => setHighlight(i)}
            className={`px-3 py-2 cursor-pointer ${i === highlight ? 'bg-primary/10' : 'hover:bg-stone-50'}`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className={`text-sm font-semibold truncate ${c.name ? 'text-ink' : 'text-muted'}`}>{c.name || 'Customer not named'}</span>
              <span className="font-mono text-xs text-muted shrink-0">{c.phone ?? 'no phone'}</span>
            </div>
            <div className="text-[11px] text-muted truncate">
              Last order {lastOrderText(c.lastOrder, today)}{c.favouriteItem ? ` · usually ${c.favouriteItem}` : ''}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
