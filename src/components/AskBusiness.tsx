import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import type { BakerySettings, MenuItem, Order, RawMaterial, RecipeExperiment, WastageLog } from '../types';
import { apiFetch } from '../utils/apiClient';
import { chatPeriods, prepareQuestion, STARTER_QUESTIONS, trimHistory, CHAT_MAX_QUESTION_CHARS, type ChatPeriodId, type ChatTurn } from '../utils/aiChat';
import { renderAiText, type AiRegistry, type FormatContext } from '../utils/aiFigures';
import { buildBusinessSnapshot } from '../utils/aiSnapshot';
import { buildCustomerProfiles } from '../utils/customers';
import { todayInZone } from '../utils/localDate';

type Data = {
  orders: Order[];
  menu: MenuItem[];
  /** Materials with their live remaining stock (what the Inventory tab shows). */
  materials: (RawMaterial & { remaining: number })[];
  experiments: RecipeExperiment[];
  wastageLogs: WastageLog[];
  settings: BakerySettings;
  currency: { code: string; symbol: string };
};

/** One exchange on screen. The answer keeps its tokens and the figures it was written against, so it renders correctly whatever period is chosen later. */
interface Message {
  id: number;
  /** As the owner typed it. */
  shown: string;
  /** As sent: customer names replaced by labels. */
  sent: string;
  state: 'waiting' | 'answered' | 'failed';
  answer?: string;
  error?: string;
  registry?: AiRegistry;
  customerNames?: Record<string, string>;
  periodLabel: string;
}

/**
 * "Ask your business": a floating button and a slide-over chat. The model
 * answers from a snapshot of the chosen period that is built here from the
 * app's own numbers; its answer is words and tokens, validated on the server and
 * rendered here from the same figures, so no number in an answer comes from the
 * model (see utils/aiFigures). The question is prepared on this device: customer
 * names become labels before anything is sent. Shown only to accounts AI is
 * offered to; never in the demo.
 */
export const AskBusiness: React.FC<Data & { dataReady: boolean; signedIn: boolean; now?: Date }> = ({
  orders, menu, materials, experiments, wastageLogs, settings, currency, dataReady, signedIn, now,
}) => {
  const [available, setAvailable] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [periodId, setPeriodId] = useState<ChatPeriodId>('month');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const nextId = useRef(1);
  const alive = useRef(true);
  const bottom = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fx: FormatContext = { currencySymbol: currency.symbol };
  const asked = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // Once signed in and the data has loaded, ask once what AI offers this account.
  useEffect(() => {
    if (!signedIn || !dataReady || asked.current) return;
    asked.current = true;
    (async () => {
      try {
        const res = await apiFetch('/api/ai/status');
        if (!res.ok) return;
        const status = await res.json();
        if (!alive.current || status.available !== true) return;
        setAvailable(true);
        setRemaining(typeof status.limits?.chat?.remaining === 'number' ? status.limits.chat.remaining : null);
      } catch {
        // Not reachable: the button simply does not appear.
      }
    })();
  }, [signedIn, dataReady]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, open]);

  const clock = now ?? new Date();
  const today = todayInZone(settings.timezone, clock);
  const periods = useMemo(() => chatPeriods(today), [today]);
  const customers = useMemo(
    () => (open ? buildCustomerProfiles({ orders, menu, materials, settings, today }) : []),
    [open, orders, menu, materials, settings, today]
  );

  if (!available) return null;

  const busy = messages.some(m => m.state === 'waiting');
  const outOfQuestions = remaining !== null && remaining <= 0;

  const send = async (text: string) => {
    const typed = text.trim();
    if (!typed || busy || outOfQuestions) return;
    const choice = periods.find(p => p.id === periodId) ?? periods[0];
    const { text: sent, mentioned } = prepareQuestion(typed, customers);
    const id = nextId.current++;
    // Earlier answered exchanges, as the model should see them.
    const history: ChatTurn[] = trimHistory(
      messages.filter(m => m.state === 'answered' && m.answer).map(m => ({ question: m.sent, answer: m.answer! }))
    );
    setMessages(prev => [...prev, { id, shown: typed, sent, state: 'waiting', periodLabel: choice.label }]);
    setInput('');

    const built = buildBusinessSnapshot({
      period: choice.period, comparison: choice.comparison, orders, menu, materials, experiments, wastageLogs,
      settings, currency, customers, today, mentionedCustomers: mentioned,
    });
    const finish = (patch: Partial<Message>) => {
      if (alive.current) setMessages(prev => prev.map(m => (m.id === id ? { ...m, ...patch } : m)));
    };
    try {
      const res = await apiFetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: sent, snapshot: built.promptSnapshot, history }),
      });
      const body = await res.json().catch(() => ({}));
      if (alive.current && typeof body.remaining === 'number') setRemaining(body.remaining);
      if (res.ok && typeof body.answer === 'string') {
        finish({ state: 'answered', answer: body.answer, registry: built.registry, customerNames: built.customerNames });
      } else {
        if (alive.current && res.status === 429) setRemaining(0);
        finish({ state: 'failed', error: typeof body.error === 'string' ? body.error : 'That could not be answered right now.' });
      }
    } catch {
      finish({ state: 'failed', error: 'The assistant could not be reached. Please try again.' });
    }
  };

  return (
    <>
      {!open && createPortal(
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ask your business"
          className="fixed z-50 bottom-24 left-4 md:bottom-6 md:right-6 md:left-auto h-11 px-4 flex items-center justify-center gap-2 rounded-full bg-primary text-white text-sm font-semibold shadow-[0_8px_24px_rgba(0,121,123,0.3)] hover:bg-primary-dark transition-colors active:scale-95"
        >
          <Sparkles size={16} />
          Ask
        </button>,
        document.body
      )}

      {open && createPortal(
        <div className="fixed inset-0 z-[60] flex justify-end bg-ink/40 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <aside role="dialog" aria-label="Ask your business" className="bg-white w-full sm:max-w-md h-full flex flex-col shadow-2xl">
            <div className="h-1 bg-gradient-to-r from-primary to-margin shrink-0" />
            <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><MessageCircle size={20} /></span>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-ink">Ask your business</h2>
                  <p className="font-mono text-[11px] text-muted">
                    {remaining === null ? 'AI answers from your own numbers' : `${remaining} ${remaining === 1 ? 'question' : 'questions'} left today`}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="h-9 w-9 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-stone-100 shrink-0">
                <X size={18} />
              </button>
            </div>

            <div className="px-5 pb-3 shrink-0">
              <label className="block font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mb-1.5" htmlFor="ask-period">Ask about</label>
              <select
                id="ask-period"
                value={periodId}
                onChange={(e) => setPeriodId(e.target.value as ChatPeriodId)}
                className="w-full bg-stone-50 rounded-xl px-3 py-2 text-sm text-ink outline-none focus:ring-2 focus:ring-primary/20"
              >
                {periods.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4 border-t border-stone-100" aria-live="polite">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-muted">Ask about your profit, products, customers or stock. Answers use your own numbers, for the period above.</p>
                  <div className="flex flex-wrap gap-2">
                    {STARTER_QUESTIONS.map(q => (
                      <button key={q} type="button" disabled={outOfQuestions} onClick={() => send(q)}
                        className="text-left text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-full px-3 py-1.5 transition-colors disabled:opacity-40">
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map(m => (
                <div key={m.id} className="space-y-2">
                  <div className="flex justify-end">
                    <div className="max-w-[85%] bg-primary text-white rounded-2xl rounded-br-md px-4 py-2.5 text-sm whitespace-pre-wrap break-words">{m.shown}</div>
                  </div>
                  <div className="flex justify-start">
                    <div className="max-w-[92%] bg-stone-50 rounded-2xl rounded-bl-md px-4 py-3 text-sm text-ink">
                      {m.state === 'waiting' && <span className="flex items-center gap-2 text-muted"><Loader2 size={15} className="animate-spin" /> Looking at your numbers…</span>}
                      {m.state === 'answered' && m.answer && m.registry && (
                        <>
                          <p className="whitespace-pre-wrap break-words">{renderAiText(m.answer, m.registry, fx, m.customerNames)}</p>
                          <p className="mt-2 font-mono text-[10px] text-muted">{m.periodLabel}</p>
                        </>
                      )}
                      {m.state === 'failed' && <p className="text-coral">{m.error}</p>}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottom} />
            </div>

            <form
              className="px-5 py-4 border-t border-stone-100 shrink-0 space-y-2"
              onSubmit={(e) => { e.preventDefault(); send(input); }}
            >
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
                  maxLength={CHAT_MAX_QUESTION_CHARS}
                  rows={2}
                  disabled={outOfQuestions}
                  placeholder={outOfQuestions ? 'You have used today\'s questions' : 'Ask a question about your business'}
                  aria-label="Your question"
                  className="flex-1 resize-none bg-stone-50 rounded-xl px-3 py-2.5 text-sm text-ink placeholder:text-muted/70 outline-none focus:bg-white focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={busy || outOfQuestions || input.trim() === ''}
                  aria-label="Send"
                  className="h-11 w-11 flex items-center justify-center rounded-xl bg-primary text-white hover:bg-primary-dark transition-colors disabled:opacity-40 disabled:pointer-events-none shrink-0"
                >
                  <Send size={18} />
                </button>
              </div>
              <p className="text-[11px] text-muted">Every figure comes from your own data. The AI only writes the words.</p>
            </form>
          </aside>
        </div>,
        document.body
      )}
    </>
  );
};
