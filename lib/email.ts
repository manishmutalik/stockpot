/**
 * email.ts
 *
 * The server's one way to send an email: Resend's HTTP API (https://resend.com), which works from any host that can make
 * an HTTPS request (many hosts block the ports ordinary mail servers use). Used for notes to the Stockpot owner, such as a
 * new waitlist sign-up; never for mail to customers.
 *
 *   RESEND_API_KEY     the Resend API key; without it nothing is sent (each attempt is logged as skipped)
 *   EMAIL_FROM         the sender (default "Stockpot <onboarding@resend.dev>", Resend's address for an account with no
 *                      domain of its own, which may only send to the email the Resend account was made with)
 *
 * A failure is logged with Resend's status and message, and never stops what asked for the email.
 */

export interface Email { to: string; subject: string; text: string }
export type EmailSender = (email: Email) => Promise<'sent' | 'skipped' | 'failed'>;

export const RESEND_URL = 'https://api.resend.com/emails';
export const DEFAULT_EMAIL_FROM = 'Stockpot <onboarding@resend.dev>';

export function createEmailSender(input: { apiKey: () => string | undefined; from?: () => string | undefined; fetchImpl?: typeof fetch; timeoutMs?: number }): EmailSender {
  return async ({ to, subject, text }) => {
    const key = input.apiKey()?.trim();
    if (!key) {
      console.warn('[email] skipped: RESEND_API_KEY is not set', { subject });
      return 'skipped';
    }
    try {
      const res = await (input.fetchImpl ?? fetch)(RESEND_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: input.from?.()?.trim() || DEFAULT_EMAIL_FROM, to: [to], subject, text }),
        signal: AbortSignal.timeout(input.timeoutMs ?? 15_000),
      });
      if (!res.ok) {
        console.error('[email] failed', { status: res.status, detail: (await res.text().catch(() => '')).slice(0, 300) });
        return 'failed';
      }
      return 'sent';
    } catch (err: unknown) {
      console.error('[email] failed', { error: (err as Error)?.message });
      return 'failed';
    }
  };
}
