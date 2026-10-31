import React, { useState } from 'react';
import { CircleCheck, Loader2 } from 'lucide-react';
import { checkWaitlist, WAITLIST_BUSINESS_TYPES } from '../../utils/waitlist';

const FIELD = 'w-full h-12 rounded-xl bg-white border border-[#D0E4E2] px-4 text-base text-ink placeholder:text-muted/70 outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary';
const LABEL = 'block text-sm font-semibold text-ink mb-1.5';

type State = { kind: 'idle' } | { kind: 'sending' } | { kind: 'done' } | { kind: 'error'; message: string; field?: string };

/**
 * The landing page's "Join the waitlist", before launch: a name, a WhatsApp number or an email, and optionally the kind of
 * business and the city. Checked here as the server checks it (utils/waitlist), then sent to POST /api/waitlist. The
 * `website` field is hidden from people and catches simple bots (lib/waitlistRoutes).
 */
export const WaitlistForm: React.FC = () => {
  const [form, setForm] = useState({ name: '', contact: '', business: '', city: '', website: '' });
  const [state, setState] = useState<State>({ kind: 'idle' });
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const checked = checkWaitlist(form);
    if (checked.ok === false) { setState({ kind: 'error', message: checked.message, field: checked.field }); return; }
    setState({ kind: 'sending' });
    try {
      const res = await fetch('/api/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setState({ kind: 'error', message: typeof body.error === 'string' ? body.error : 'That did not go through. Please try again.', field: body.field }); return; }
      setState({ kind: 'done' });
    } catch {
      setState({ kind: 'error', message: 'That did not go through. Check your connection and try again.' });
    }
  };

  if (state.kind === 'done') {
    return (
      <div role="status" className="flex flex-col items-center text-center gap-3 py-6">
        <CircleCheck size={40} className="text-margin" />
        <p className="text-xl font-bold text-ink">You&apos;re on the list.</p>
        <p className="text-muted max-w-sm">We&apos;ll message you when Stockpot launches, before anyone else, with the founding offer.</p>
      </div>
    );
  }

  const invalid = (field: string) => state.kind === 'error' && state.field === field;
  return (
    <form onSubmit={e => void submit(e)} noValidate className="grid sm:grid-cols-2 gap-4 text-left">
      <div>
        <label htmlFor="wl-name" className={LABEL}>Your name</label>
        <input id="wl-name" autoComplete="name" value={form.name} onChange={set('name')} aria-invalid={invalid('name')} className={FIELD} placeholder="Asha Rao" />
      </div>
      <div>
        <label htmlFor="wl-contact" className={LABEL}>WhatsApp number or email</label>
        <input id="wl-contact" inputMode="text" autoComplete="tel" value={form.contact} onChange={set('contact')} aria-invalid={invalid('contact')} className={FIELD} placeholder="98765 43210" />
      </div>
      <div>
        <label htmlFor="wl-business" className={LABEL}>Your business <span className="font-normal text-muted">(optional)</span></label>
        <select id="wl-business" value={form.business} onChange={set('business')} aria-invalid={invalid('business')} className={FIELD}>
          <option value="">Choose one</option>
          {WAITLIST_BUSINESS_TYPES.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="wl-city" className={LABEL}>City <span className="font-normal text-muted">(optional)</span></label>
        <input id="wl-city" autoComplete="address-level2" value={form.city} onChange={set('city')} aria-invalid={invalid('city')} className={FIELD} placeholder="Pune" />
      </div>
      {/* Hidden from people; a bot that fills every field fills this one too */}
      <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
        <label htmlFor="wl-website">Website</label>
        <input id="wl-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
      </div>
      <div className="sm:col-span-2 space-y-3">
        {state.kind === 'error' && <p role="alert" className="text-sm font-semibold text-coral">{state.message}</p>}
        <button type="submit" disabled={state.kind === 'sending'}
          className="landing-shimmer w-full inline-flex items-center justify-center gap-2 h-12 px-7 rounded-xl bg-primary hover:bg-primary-dark text-white font-semibold shadow-md shadow-primary/20 transition-colors disabled:opacity-60">
          {state.kind === 'sending' ? <><Loader2 size={18} className="animate-spin" /> Adding you…</> : 'Join the waitlist'}
        </button>
        <p className="text-xs text-muted text-center">We&apos;ll only use this to tell you when Stockpot launches. No spam, and we never share it.</p>
      </div>
    </form>
  );
};
