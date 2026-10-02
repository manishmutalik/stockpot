import React, { useId } from 'react';
import { Minus, Plus, X } from 'lucide-react';

/** Mono, uppercase caption used above every form field in a modal. */
export const MODAL_LABEL = 'block font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mb-1.5';

/** Shared field look: tinted fill, teal focus ring, coral border when `invalid`. */
export const modalField = (invalid = false) =>
  `w-full bg-stone-50 border rounded-xl px-4 py-3 text-sm text-ink placeholder:text-muted/70 outline-none transition-colors focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary ${
    invalid ? 'border-coral' : 'border-transparent'
  }`;

/**
 * Frame shared by the Add Order and Log Production Run modals: a bottom
 * sheet on phones and a centred card from `sm` up, with a teal accent bar,
 * an icon tile + title + mono subtitle header, a scrolling body and a pinned
 * footer. Content and behaviour live in the modals themselves.
 */
export const ModalShell: React.FC<{
  title: string;
  subtitle: string;
  icon: React.ElementType;
  onClose: () => void;
  footer: React.ReactNode;
  children: React.ReactNode;
  /** Colour of the icon tile; the default suits neutral "create" flows. */
  tone?: 'primary' | 'coral' | 'amber';
  /** Width class from `sm` up (phones always get a full-width sheet). */
  widthClass?: string;
  /** Close when the dimmed backdrop is clicked. Off by default so a stray click can't lose a long form. */
  closeOnBackdrop?: boolean;
  /** When set, body and footer are wrapped in a <form> so Enter submits and `required` fields validate natively. */
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
}> = ({ title, subtitle, icon: Icon, onClose, footer, children, tone = 'primary', widthClass = 'sm:max-w-2xl', closeOnBackdrop = false, onSubmit }) => {
  const titleId = useId();
  const tile = tone === 'coral' ? 'bg-coral/10 text-coral' : tone === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-primary/10 text-primary';
  const inner = (
    <>
      <div className="px-5 sm:px-8 pb-6 space-y-5 overflow-y-auto flex-1">{children}</div>
      <div className="px-5 sm:px-8 py-4 border-t border-stone-100 bg-white shrink-0">{footer}</div>
    </>
  );
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-ink/40 backdrop-blur-sm"
      onMouseDown={closeOnBackdrop ? (e) => { if (e.target === e.currentTarget) onClose(); } : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative bg-white w-full ${widthClass} rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] sm:max-h-[90vh]`}
      >
        <div className="hidden sm:block h-1 bg-gradient-to-r from-primary to-margin shrink-0" />
        <div className="sm:hidden flex justify-center pt-3 shrink-0">
          <div className="h-1 w-10 rounded-full bg-stone-200" />
        </div>

        <div className="flex items-center justify-between gap-3 px-5 sm:px-8 pt-4 sm:pt-6 pb-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${tile}`}>
              <Icon size={22} />
            </div>
            <div className="min-w-0">
              <h2 id={titleId} className="text-xl font-bold tracking-tight text-ink break-words">{title}</h2>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-full bg-stone-100 hover:bg-stone-200 text-muted transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {onSubmit ? (
          <form onSubmit={onSubmit} className="flex flex-col flex-1 min-h-0">{inner}</form>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">{inner}</div>
        )}
      </div>
    </div>
  );
};

/** − [n] + control for an item quantity; the input keeps the "Qty" placeholder. */
export const QuantityStepper: React.FC<{
  value: number;
  onChange: (n: number) => void;
  invalid?: boolean;
}> = ({ value, onChange, invalid }) => (
  <div className={`flex items-center bg-stone-50 border rounded-xl shrink-0 ${invalid ? 'border-coral' : 'border-transparent'}`}>
    <button
      type="button"
      onClick={() => onChange(Math.max(0, value - 1))}
      aria-label="Decrease quantity"
      className="p-3 text-muted hover:text-primary transition-colors"
    >
      <Minus size={16} />
    </button>
    <input
      type="number"
      min={1}
      value={value === 0 ? '' : value}
      onChange={e => onChange(parseInt(e.target.value) || 0)}
      placeholder="Qty"
      className="w-12 bg-transparent text-center font-mono text-sm font-semibold text-ink outline-none py-3 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
    <button
      type="button"
      onClick={() => onChange(value + 1)}
      aria-label="Increase quantity"
      className="p-3 text-muted hover:text-primary transition-colors"
    >
      <Plus size={16} />
    </button>
  </div>
);
