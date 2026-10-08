import React from 'react';

/** Pieces of the Settings screen shared by its sections and by cards that live in their own files. */

export const LABEL = 'block font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mb-1.5';
export const FIELD =
  'w-full bg-stone-50 border border-transparent rounded-lg px-4 py-3 text-sm text-ink placeholder:text-muted/70 outline-none transition-colors focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary';

/** A white card with an icon tile, title and subtitle, and the section's fields below. */
export const Section: React.FC<{
  icon: React.ElementType;
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}> = ({ icon: Icon, title, subtitle, badge, children }) => (
  <section className="surface-card p-5 sm:p-7 space-y-6">
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
          <Icon size={20} />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-bold tracking-tight text-ink">{title}</h3>
          <p className="text-sm text-muted">{subtitle}</p>
        </div>
      </div>
      {badge}
    </div>
    {children}
  </section>
);

export const Pill: React.FC<{ tone: 'green' | 'coral' | 'slate'; children: React.ReactNode }> = ({ tone, children }) => (
  <span
    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-mono text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${
      tone === 'green' ? 'bg-margin/10 text-[#006143]' : tone === 'coral' ? 'bg-coral/10 text-coral' : 'bg-stone-100 text-muted'
    }`}
  >
    {children}
  </span>
);

