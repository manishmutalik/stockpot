import React, { useState } from 'react';
import { MailWarning } from 'lucide-react';

/** What sending a verification email came to. */
export type VerificationSent = { ok: true } | { ok: false; message: string };

/**
 * Settings › User Account, for an email-and-password account whose address is not verified yet: send the verification
 * email (again), and once the link in it has been opened, check, so the server sees the verified address straight
 * away instead of at the next sign-in. Shown only while the address is unverified (utils/aiAccess).
 */
export const EmailVerificationNotice: React.FC<{
  email: string;
  onSend: () => Promise<VerificationSent>;
  /** Whether the address is verified now; when it is, the app reloads with the fresh sign-in. */
  onCheck: () => Promise<boolean>;
}> = ({ email, onSend, onCheck }) => {
  const [busy, setBusy] = useState<'send' | 'check' | null>(null);
  const [note, setNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

  const send = async () => {
    setBusy('send');
    setNote(null);
    const sent = await onSend();
    setBusy(null);
    setNote(sent.ok
      ? { tone: 'ok', text: `Sent to ${email}. Open the link in it (check spam too), then press I've verified it.` }
      : { tone: 'warn', text: sent.message });
  };

  const check = async () => {
    setBusy('check');
    setNote(null);
    let verified: boolean;
    try {
      verified = await onCheck();
    } catch {
      setBusy(null);
      setNote({ tone: 'warn', text: 'Could not check just now. Check your connection and try again.' });
      return;
    }
    if (verified) {
      setNote({ tone: 'ok', text: 'Verified. Refreshing…' });
      return;
    }
    setBusy(null);
    setNote({ tone: 'warn', text: 'Not verified yet. Open the link in the email first; if it has not arrived, send it again.' });
  };

  return (
    <div role="region" aria-label="Email verification" className="bg-coral/5 border border-coral/20 rounded-xl px-4 py-3 text-left space-y-2.5">
      <div className="flex items-start gap-2.5">
        <MailWarning size={18} className="text-coral shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-ink">Your email isn't verified</p>
          <p className="text-xs text-muted mt-0.5">Verify {email} to use the AI features, such as Read a recipe.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={send}
          disabled={busy !== null}
          className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-50"
        >
          {busy === 'send' ? 'Sending…' : 'Send verification email'}
        </button>
        <button
          onClick={check}
          disabled={busy !== null}
          className="h-9 px-4 rounded-lg bg-white border border-stone-200 text-ink text-sm font-semibold hover:bg-stone-100 disabled:opacity-50"
        >
          {busy === 'check' ? 'Checking…' : "I've verified it"}
        </button>
      </div>
      {note && (
        <p role="status" className={`text-xs ${note.tone === 'ok' ? 'text-[#006143]' : 'text-coral'}`}>{note.text}</p>
      )}
    </div>
  );
};
