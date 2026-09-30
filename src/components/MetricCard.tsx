import React from 'react';

export type Tone = 'slate' | 'teal' | 'coral';

const TONES: Record<Tone, { label: string; value: string; tile: string; foot: string; footValue: string }> = {
  slate: { label: 'text-muted', value: 'text-ink', tile: 'bg-stone-100 text-muted', foot: 'bg-stone-50', footValue: 'text-ink' },
  teal: { label: 'text-muted', value: 'text-ink', tile: 'bg-primary/10 text-primary', foot: 'bg-stone-50', footValue: 'text-primary' },
  coral: { label: 'text-coral', value: 'text-coral', tile: 'bg-coral/10 text-coral', foot: 'bg-coral/5', footValue: 'text-coral' },
};

/**
 * One headline figure: label + big mono number + icon tile, with a tinted
 * footer strip carrying a supporting stat ("7 runs in period", "31.2% of
 * income"). Numbers use the mono face so columns of cards line up.
 */
export const MetricCard: React.FC<{
  label: string;
  value: string;
  icon: React.ElementType;
  tone: Tone;
  footLeft: string;
  footRight?: string | null;
}> = ({ label, value, icon: Icon, tone, footLeft, footRight }) => {
  const t = TONES[tone];
  return (
    <div className="surface-card overflow-hidden flex flex-col min-w-0">
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${t.label}`}>{label}</div>
          <div className={`mt-2 font-mono text-xl md:text-[22px] font-semibold tracking-tight truncate ${t.value}`}>{value}</div>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${t.tile}`}>
          <Icon size={20} />
        </div>
      </div>
      <div className={`mt-auto px-4 py-2.5 flex items-center justify-between gap-2 font-mono text-[11px] uppercase ${t.foot}`}>
        <span className="text-muted truncate">{footLeft}</span>
        {footRight && <span className={`font-semibold whitespace-nowrap ${t.footValue}`}>{footRight}</span>}
      </div>
    </div>
  );
};
