import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import type { BakerySettings, MenuItem, Order, RawMaterial, RecipeExperiment, WastageLog } from '../types';
import { apiFetch } from '../utils/apiClient';
import {
  buildBriefingHeadline, buildDeterministicBriefing, contentResolves, type BriefingContent, type StoredBriefing,
} from '../utils/aiBriefing';
import { formatFigure, renderAiText, type FormatContext } from '../utils/aiFigures';
import { buildBusinessSnapshot } from '../utils/aiSnapshot';
import { buildCustomerProfiles } from '../utils/customers';
import { addDays, todayInZone } from '../utils/localDate';

type Data = {
  orders: Order[];
  menu: MenuItem[];
  /** Materials with their live remaining stock (what the Inventory tab shows). */
  materials: (RawMaterial & { remaining: number })[];
  experiments: RecipeExperiment[];
  wastageLogs: WastageLog[];
  /** To work out which materials will run out soon. */
  productionRuns?: { recipeId: string; quantityProduced: number; date: string }[];
  settings: BakerySettings;
  currency: { code: string; symbol: string };
};

type View =
  | { kind: 'idle' }                                    // nothing decided yet, or AI is not offered to this account: show nothing
  | { kind: 'sample' }                                  // the demo: a sample built from the demo data
  | { kind: 'loading' }
  | { kind: 'ready'; briefing: StoredBriefing; remaining?: number }
  | { kind: 'unavailable'; message: string };           // AI was offered but could not answer: the summary built by code

const RETRY_AFTER_MS = 4000;
const MAX_WAITS = 3;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const Tile: React.FC<{ label: string; value: string; change?: string }> = ({ label, value, change }) => (
  <div className="bg-stone-50 rounded-xl px-3 py-2.5 min-w-0">
    <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</div>
    <div className="font-mono text-lg font-semibold text-ink truncate">{value}</div>
    {change && <div className="font-mono text-[11px] text-muted">{change}</div>}
  </div>
);

/**
 * "Yesterday's briefing" at the top of the Dashboard. The headline, the tiles and
 * the 7-day bars are the application's own numbers. The explanation and the
 * attention list are written by the model, but only as words and tokens that are
 * validated on the server and resolved here against this screen's own figures,
 * so no number in this card comes from the model (see utils/aiFigures). When AI
 * is not offered the card is not shown; in the demo it shows a sample built from
 * the demo data by the same code; when AI is offered but cannot answer it shows
 * that same code-built summary with a note.
 */
export const DailyBriefing: React.FC<Data & { dataReady: boolean; now?: Date }> = ({
  orders, menu, materials, experiments, wastageLogs, productionRuns, settings, currency, dataReady, now,
}) => {
  const [view, setView] = useState<View>({ kind: 'idle' });
  const [refreshing, setRefreshing] = useState(false);
  const fx: FormatContext = { currencySymbol: currency.symbol };
  const clock = now ?? new Date();
  const today = todayInZone(settings.timezone, clock);
  const yesterday = addDays(today, -1);

  // What the screen knows about yesterday, from the same code as everywhere else.
  const built = useMemo(() => {
    if (!dataReady || orders.length === 0) return null;
    const customers = buildCustomerProfiles({ orders, menu, materials, settings, today });
    return buildBusinessSnapshot({
      period: { start: yesterday, end: yesterday }, orders, menu, materials, experiments, wastageLogs, productionRuns, settings, currency, customers, today,
    });
  }, [dataReady, orders, menu, materials, experiments, wastageLogs, productionRuns, settings, currency, today, yesterday]);

  // The latest snapshot, for the request below (which can outlive a render while it waits on another tab).
  const builtRef = useRef(built);
  useEffect(() => { builtRef.current = built; });
  const askedFor = useRef<string | null>(null);

  const requestBriefing = async (refresh: boolean): Promise<View> => {
    for (let waited = 0; ; waited++) {
      const snapshot = builtRef.current?.promptSnapshot;
      if (!snapshot) return { kind: 'idle' };
      let res: Response;
      try {
        res = await apiFetch('/api/ai/briefing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ snapshot, refresh }),
        });
      } catch {
        return { kind: 'unavailable', message: 'The briefing could not be reached.' };
      }
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.briefing) return { kind: 'ready', briefing: body.briefing as StoredBriefing, remaining: body.remaining };
      if (res.status === 409 && waited < MAX_WAITS) { await sleep(RETRY_AFTER_MS); continue; }
      return { kind: 'unavailable', message: typeof body.error === 'string' ? body.error : 'The AI explanation is unavailable right now.' };
    }
  };

  // Only leaving the screen cancels a request. A change in the data while it is in flight must not, because
  // the request is made once per day and would then never be made again.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // Once the data is in, ask once per day what AI offers this account.
  const hasData = built !== null;
  useEffect(() => {
    if (!hasData || askedFor.current === today) return;
    askedFor.current = today;
    (async () => {
      try {
        const res = await apiFetch('/api/ai/status');
        if (!res.ok) return;
        const status = await res.json();
        if (!alive.current) return;
        if (status.available === true) {
          setView({ kind: 'loading' });
          const next = await requestBriefing(false);
          if (alive.current) setView(next);
        } else if (status.reason === 'demo_account') {
          setView({ kind: 'sample' });
        }
      } catch {
        // Not reachable or not signed in: the card simply does not appear.
      }
    })();
  }, [hasData, today]);

  const refresh = async () => {
    setRefreshing(true);
    const next = await requestBriefing(true);
    if (!alive.current) return;
    setView(prev => (next.kind === 'ready' || prev.kind !== 'ready' ? next : prev));
    setRefreshing(false);
  };

  if (!built || view.kind === 'idle') return null;
  const { promptSnapshot: snapshot, registry, customerNames } = built;

  if (view.kind === 'loading') {
    return (
      <section aria-label="Yesterday's briefing" className="surface-card p-5 flex items-center gap-3 text-muted text-sm">
        <Loader2 size={18} className="animate-spin" /> Preparing yesterday&apos;s briefing…
      </section>
    );
  }

  const deterministic = buildDeterministicBriefing(snapshot);
  let content: BriefingContent = deterministic;
  let tag: { label: string; title: string };
  let note: string | null = null;
  if (view.kind === 'sample') {
    tag = { label: 'Sample', title: 'Built from your demo data. In a real account an AI-written explanation appears here.' };
  } else if (view.kind === 'unavailable') {
    tag = { label: 'Summary', title: 'Built from your numbers' };
    note = `${view.message} This summary is built from your numbers.`;
  } else if (view.briefing.source === 'ai' && view.briefing.content && contentResolves(view.briefing.content, registry, customerNames)) {
    content = view.briefing.content;
    tag = { label: 'AI', title: 'The explanation was written by AI from your numbers. The numbers themselves never come from AI.' };
  } else {
    tag = { label: 'Summary', title: 'Built from your numbers' };
    note = view.briefing.source === 'ai'
      ? 'Your data has changed since this was written. Refresh for a new explanation.'
      : 'The AI explanation could not be checked, so this summary is built from your numbers.';
  }

  const show = (id: string) => (registry.figures[id] ? formatFigure(registry.figures[id], fx) : '-');
  const change = (id: string) => (registry.figures[id] ? `${formatFigure(registry.figures[id], fx)} on ${snapshot.comparison.label}` : undefined);
  const render = (text: string) => renderAiText(text, registry, fx, customerNames);
  const trendMax = Math.max(...snapshot.trend.map(t => Number(registry.figures[t.revenue]?.value ?? 0)), 1);
  const canRefresh = view.kind === 'ready' && view.remaining !== 0;

  return (
    <section aria-label="Yesterday's briefing" className="surface-card p-5 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><Sparkles size={20} /></span>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-ink">Yesterday&apos;s briefing</h3>
            <span title={tag.title} className="font-mono text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 rounded-full px-2 py-0.5">{tag.label}</span>
          </div>
        </div>
        {view.kind === 'ready' && (
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing || !canRefresh}
            aria-label="Write a fresh explanation"
            title={canRefresh ? 'Ask for a fresh explanation (uses one of today\'s allowance)' : 'You have used today\'s allowance'}
            className="h-9 w-9 flex items-center justify-center rounded-lg text-muted hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:pointer-events-none shrink-0"
          >
            {refreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </button>
        )}
      </div>

      <p className="text-ink font-medium">{buildBriefingHeadline(snapshot, registry, fx)}</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Revenue" value={show('revenue_now')} change={change('revenue_change_pct')} />
        <Tile label="True profit" value={show('true_profit_now')} change={change('true_profit_change_pct')} />
        <Tile label="Orders" value={show('orders_now')} />
        <Tile label="Wastage" value={show('wastage_now')} />
      </div>

      <div aria-hidden="true" className="flex items-end gap-1.5 h-12">
        {snapshot.trend.map(t => {
          const value = Number(registry.figures[t.revenue]?.value ?? 0);
          return (
            <div key={t.day} className="flex-1 flex flex-col items-center justify-end gap-1 h-full" title={`${t.day}: ${show(t.revenue)}`}>
              <div className="w-full rounded-sm bg-primary/30" style={{ height: `${Math.max((value / trendMax) * 100, value > 0 ? 8 : 2)}%` }} />
              <span className="font-mono text-[9px] text-muted">{t.day.slice(0, 1)}</span>
            </div>
          );
        })}
      </div>

      <p className="text-sm text-ink">{render(content.why)}</p>

      {content.attention.length > 0 && (
        <ul className="space-y-1.5">
          {content.attention.map((a, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-ink">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span>{render(a.text)}</span>
            </li>
          ))}
        </ul>
      )}

      {note && <p className="text-xs text-muted">{note}</p>}
      <p className="text-[11px] text-muted">
        {view.kind === 'sample' ? 'Every figure here comes from the demo data.' : 'Every figure here comes from your own data. The AI only writes the explanation.'}
      </p>
    </section>
  );
};
