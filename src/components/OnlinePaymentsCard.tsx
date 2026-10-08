import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, CreditCard, Loader2, Trash2 } from 'lucide-react';
import { apiFetch } from '../utils/apiClient';
import {
  PROVIDERS, TEST_MODE_NOTE, emptyForm, providerInfo, requestBody, summarize, validateForm,
  type GatewayForm, type GatewayProviderId, type GatewayStatus,
} from '../utils/onlinePayments';
import { FIELD, LABEL, Pill, Section } from './settingsParts';

type Note = { tone: 'good' | 'bad'; text: string };

/** One call to our own API: the parsed answer, and the server's own words when it said no. */
async function call(method: 'GET' | 'PUT' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<{ ok: boolean; data: any }> {
  const res = await apiFetch(path, {
    method,
    ...(body !== undefined && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

/**
 * Settings, Online payments: the owner's own payment gateway. Saved on its own (not by the page's Save button), because the keys
 * are checked with the gateway and kept by the server, encrypted; this screen never holds them longer than the form is open and
 * is never sent them back, only the last four characters of the secret.
 */
export const OnlinePaymentsCard: React.FC = () => {
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<GatewayForm>(emptyForm());
  const [busy, setBusy] = useState<'save' | 'test' | 'remove' | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const { ok, data } = await call('GET', '/api/payments/gateway');
      if (!ok) throw new Error(data?.error || 'failed');
      setStatus(data as GatewayStatus);
    } catch {
      setLoadError('Could not load your online payment settings.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const set = (patch: Partial<GatewayForm>) => { setForm(f => ({ ...f, ...patch })); setNote(null); };
  const info = providerInfo(form.provider);
  const summary = status ? summarize(status) : null;
  const keysNeedServer = form.provider !== 'link' && status !== null && !status.serverReady;

  const save = async () => {
    const problem = validateForm(form);
    if (problem) { setNote({ tone: 'bad', text: problem }); return; }
    setBusy('save'); setNote(null);
    try {
      const { ok, data } = await call('PUT', '/api/payments/gateway', requestBody(form));
      if (!ok) { setNote({ tone: 'bad', text: data?.error || 'Could not save that. Please try again.' }); return; }
      setStatus(data as GatewayStatus);
      setForm(emptyForm(form.provider)); // the secret is gone from this screen the moment it is kept
      setEditing(false);
      setNote({ tone: 'good', text: form.provider === 'link' ? 'Saved. Customers will see a button to your payment link on their bill.' : `Saved. ${data.test ? 'The gateway accepted your test keys.' : 'The gateway accepted your keys.'}` });
    } catch {
      setNote({ tone: 'bad', text: 'Could not reach the server. Please try again.' });
    } finally { setBusy(null); }
  };

  const test = async () => {
    setBusy('test'); setNote(null);
    try {
      const { ok, data } = await call('POST', '/api/payments/gateway/test');
      if (!ok) setNote({ tone: 'bad', text: data?.error || 'Could not check the keys. Please try again.' });
      else if (data.ok) setNote({ tone: 'good', text: 'The gateway accepted your keys.' });
      else setNote({ tone: 'bad', text: data.message || 'The gateway did not accept your keys.' });
    } catch {
      setNote({ tone: 'bad', text: 'Could not reach the server. Please try again.' });
    } finally { setBusy(null); }
  };

  const remove = async () => {
    setBusy('remove'); setNote(null);
    try {
      const { ok, data } = await call('DELETE', '/api/payments/gateway');
      if (!ok) { setNote({ tone: 'bad', text: data?.error || 'Could not remove it. Please try again.' }); return; }
      setStatus(data as GatewayStatus);
      setConfirmRemove(false);
      setNote({ tone: 'good', text: 'Removed. Customers no longer see a card button on their bills.' });
    } catch {
      setNote({ tone: 'bad', text: 'Could not reach the server. Please try again.' });
    } finally { setBusy(null); }
  };

  const showForm = status !== null && (!status.configured || editing);

  return (
    <Section
      icon={CreditCard}
      title="Online payments"
      subtitle="Let customers pay a bill by card or online, straight into your own account"
      badge={summary ? <Pill tone={summary.mode === 'test' ? 'coral' : 'green'}>{summary.mode === 'test' ? 'Test mode' : summary.mode === 'link' ? 'Payment link' : 'On'}</Pill> : status ? <Pill tone="slate">Off</Pill> : undefined}
    >
      <p className="text-sm text-muted -mt-2">
        Customers who open their bill get a <strong className="text-ink font-semibold">Pay by card or online</strong> button. They pay on your gateway's own page and the money goes to
        your gateway account, not through Stockpot. When the gateway confirms the payment, the order is marked paid by card automatically, with the card fee you set under Payment fees.
      </p>

      {loadError && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-coral/10 px-4 py-3 text-sm text-coral">
          <span>{loadError}</span>
          <button type="button" onClick={load} className="font-semibold underline">Try again</button>
        </div>
      )}
      {!status && !loadError && <p className="text-sm text-muted flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading…</p>}

      {note && (
        <div role={note.tone === 'bad' ? 'alert' : 'status'}
          className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${note.tone === 'bad' ? 'bg-coral/10 text-coral' : 'bg-margin/10 text-[#006143]'}`}>
          {note.tone === 'bad' ? <AlertCircle size={18} className="shrink-0 mt-0.5" /> : <CheckCircle2 size={18} className="shrink-0 mt-0.5" />}
          <span>{note.text}</span>
        </div>
      )}

      {summary && !showForm && (
        <div className="space-y-4">
          <div className="rounded-xl bg-stone-50 px-4 py-3">
            <p className="font-semibold text-ink">{summary.title}</p>
            {summary.details.map(d => <p key={d} className="text-sm text-muted font-mono break-all">{d}</p>)}
          </div>
          {summary.mode === 'test' && <p className="text-sm text-muted">{TEST_MODE_NOTE}</p>}
          {summary.mode === 'link' && <p className="text-sm text-muted">Customers are sent to this link. Stockpot cannot tell when it is paid, so mark the order paid yourself.</p>}
          <div className="flex flex-wrap gap-3">
            {summary.mode !== 'link' && (
              <button type="button" onClick={test} disabled={busy !== null}
                className="h-10 px-5 rounded-lg border border-stone-300 text-sm font-semibold text-ink hover:bg-stone-50 disabled:opacity-50">
                {busy === 'test' ? 'Checking…' : 'Test connection'}
              </button>
            )}
            <button type="button" onClick={() => { setEditing(true); setForm(emptyForm(status!.provider)); setNote(null); }} disabled={busy !== null}
              className="h-10 px-5 rounded-lg border border-stone-300 text-sm font-semibold text-ink hover:bg-stone-50 disabled:opacity-50">
              {summary.mode === 'link' ? 'Change' : 'Replace keys'}
            </button>
            {!confirmRemove ? (
              <button type="button" onClick={() => setConfirmRemove(true)} disabled={busy !== null}
                className="h-10 px-5 rounded-lg text-sm font-semibold text-coral hover:bg-coral/10 flex items-center gap-2 disabled:opacity-50">
                <Trash2 size={16} /> Remove
              </button>
            ) : (
              <span className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-ink">Remove it? Customers will no longer see the card button.</span>
                <button type="button" onClick={remove} disabled={busy !== null} className="h-10 px-4 rounded-lg bg-coral text-white font-semibold disabled:opacity-50">{busy === 'remove' ? 'Removing…' : 'Yes, remove'}</button>
                <button type="button" onClick={() => setConfirmRemove(false)} className="h-10 px-4 rounded-lg font-semibold text-muted hover:bg-stone-50">Keep it</button>
              </span>
            )}
          </div>
        </div>
      )}

      {showForm && (
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <fieldset>
            <legend className={LABEL}>Your payment gateway</legend>
            <div role="radiogroup" aria-label="Payment gateway" className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {PROVIDERS.map(p => {
                const on = form.provider === p.id;
                return (
                  <button key={p.id} type="button" role="radio" aria-checked={on} onClick={() => set({ ...emptyForm(p.id as GatewayProviderId) })}
                    className={`text-left rounded-xl border-2 px-4 py-3 transition-colors ${on ? 'border-primary bg-primary/5' : 'border-stone-200 hover:border-stone-300'}`}>
                    <span className="block font-semibold text-ink text-sm">{p.label}</span>
                    <span className="block text-xs text-muted mt-1">{p.blurb}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {keysNeedServer && (
            <div role="alert" className="rounded-lg bg-coral/10 px-4 py-3 text-sm text-coral">
              This server is not set up to keep gateway keys yet. Whoever runs Stockpot needs to add the encryption key (<code>PAYMENT_SECRETS_KEY</code>) first. You can still paste a payment link.
            </div>
          )}

          {form.provider === 'link' ? (
            <div>
              <label htmlFor="gw-link" className={LABEL}>Payment link</label>
              <input id="gw-link" type="url" inputMode="url" autoComplete="off" value={form.link} onChange={e => set({ link: e.target.value })}
                className={FIELD} placeholder="https://…" />
              <p className="text-xs text-muted mt-1.5">From your gateway's dashboard (a Payment Page or Payment Link). Customers choose the amount there, and you mark the order paid yourself.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted">{info.whereToFind}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="gw-key-id" className={LABEL}>{info.keyIdLabel}</label>
                  <input id="gw-key-id" type="text" autoComplete="off" spellCheck={false} value={form.keyId} onChange={e => set({ keyId: e.target.value })}
                    className={`${FIELD} font-mono`} placeholder={info.keyIdPlaceholder} />
                </div>
                <div>
                  <label htmlFor="gw-secret" className={LABEL}>{info.secretLabel}</label>
                  <input id="gw-secret" type="password" autoComplete="new-password" spellCheck={false} value={form.keySecret} onChange={e => set({ keySecret: e.target.value })}
                    className={`${FIELD} font-mono`} placeholder="Shown once by your gateway" />
                </div>
                {info.needsEnvironment && (
                  <div>
                    <label htmlFor="gw-env" className={LABEL}>These keys are for</label>
                    <select id="gw-env" value={form.environment} onChange={e => set({ environment: e.target.value as GatewayForm['environment'] })} className={FIELD}>
                      <option value="">Choose…</option>
                      <option value="sandbox">Test (sandbox): no real money</option>
                      <option value="production">Live: real money</option>
                    </select>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted">
                Your keys are checked with {info.label}, then stored encrypted. They are used only to create payment links and check whether they were paid, and are never shown again.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={busy !== null || keysNeedServer}
              className="h-10 px-6 rounded-lg bg-primary hover:bg-primary-dark text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-50">
              {busy === 'save' ? (form.provider === 'link' ? 'Saving…' : `Checking with ${info.label}…`) : form.provider === 'link' ? 'Save link' : 'Save and check keys'}
            </button>
            {editing && (
              <button type="button" onClick={() => { setEditing(false); setForm(emptyForm()); setNote(null); }} className="h-10 px-5 rounded-lg text-sm font-semibold text-muted hover:bg-stone-50">Cancel</button>
            )}
          </div>
        </form>
      )}
    </Section>
  );
};
