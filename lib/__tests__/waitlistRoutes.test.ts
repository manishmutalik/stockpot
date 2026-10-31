import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createWaitlistHandler, WAITLIST_LIMIT, waitlistEmail, waitlistId, type WaitlistStore } from '../waitlistRoutes';
import { createEmailSender, DEFAULT_EMAIL_FROM, RESEND_URL } from '../email';

interface Answer { code: number; body: Record<string, unknown> }
const res = () => {
  const r = { code: 200, body: {} } as Answer & { status: (c: number) => unknown; json: (b: Record<string, unknown>) => unknown };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; };
  return r;
};
const store = (created = true) => ({ save: vi.fn<WaitlistStore['save']>().mockResolvedValue({ created, total: 12 }) });
const good = { name: 'Asha Rao', contact: '+91 98765 43210', business: 'Tiffin service', city: 'Pune' };
const send = async (handler: ReturnType<typeof createWaitlistHandler>, body: unknown, ip = '1.2.3.4') => {
  const r = res();
  await handler({ body, headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` }, ip: '10.0.0.1' } as unknown as Request, r as unknown as Response);
  return r;
};

describe('POST /api/waitlist', () => {
  it('saves a checked entry under an id made from the contact, and says whether it was new', async () => {
    const s = store();
    const r = await send(createWaitlistHandler({ store: s, now: () => 1_000 }), good);
    expect(r.body).toEqual({ ok: true, created: true });
    expect(s.save).toHaveBeenCalledWith(waitlistId('9876543210'), {
      name: 'Asha Rao', contact: '9876543210', contactType: 'whatsapp', business: 'Tiffin service', city: 'Pune',
    }, 1_000);
  });

  it('gives the same person the same id however they type their number', () => {
    expect(waitlistId('9876543210')).toMatch(/^[0-9a-f]{32}$/);
    expect(waitlistId('9876543210')).not.toBe(waitlistId('9876543211'));
  });

  it('says which field is wrong, saving nothing', async () => {
    const s = store();
    const r = await send(createWaitlistHandler({ store: s, now: () => 0 }), { ...good, contact: 'not a contact' });
    expect(r.code).toBe(400);
    expect(r.body).toMatchObject({ field: 'contact' });
    expect(s.save).not.toHaveBeenCalled();
  });

  it('thanks and drops a bot that fills the hidden field', async () => {
    const s = store();
    const r = await send(createWaitlistHandler({ store: s, now: () => 0 }), { ...good, website: 'http://spam.example' });
    expect(r.body).toEqual({ ok: true });
    expect(s.save).not.toHaveBeenCalled();
  });

  it('allows a few tries from one address in a quarter-hour, then asks it to wait; others are not affected', async () => {
    const s = store();
    let t = 0;
    const handler = createWaitlistHandler({ store: s, now: () => t });
    for (let i = 0; i < WAITLIST_LIMIT.count; i++) expect((await send(handler, good)).code).toBe(200);
    expect((await send(handler, good)).code).toBe(429);
    expect((await send(handler, good, '5.6.7.8')).code).toBe(200);
    t = WAITLIST_LIMIT.windowMs + 1;
    expect((await send(handler, good)).code).toBe(200);
  });

  it('answers plainly if saving fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await send(createWaitlistHandler({ store: { save: vi.fn().mockRejectedValue(new Error('firestore down')) }, now: () => 0 }), good);
    expect(r.code).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain('firestore');
    err.mockRestore();
  });
});

describe('the email to the owner', () => {
  const entry = { name: 'Asha Rao', contact: '9876543210', contactType: 'whatsapp' as const, business: 'Tiffin service' as const, city: 'Pune' };

  it('is sent for a new sign-up, after answering, with the number on the list', async () => {
    const notify = vi.fn().mockResolvedValue('sent');
    const r = await send(createWaitlistHandler({ store: store(true), now: () => 1_000, notify }), good);
    expect(r.body).toEqual({ ok: true, created: true });
    expect(notify).toHaveBeenCalledWith(entry, { total: 12, at: 1_000 });
  });

  it('is not sent when someone signs up again, or when a bot fills the hidden field', async () => {
    const notify = vi.fn().mockResolvedValue('sent');
    await send(createWaitlistHandler({ store: store(false), now: () => 0, notify }), good);
    await send(createWaitlistHandler({ store: store(true), now: () => 0, notify }), { ...good, website: 'x' });
    expect(notify).not.toHaveBeenCalled();
  });

  it('never stops the sign-up when it fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await send(createWaitlistHandler({ store: store(true), now: () => 0, notify: vi.fn().mockRejectedValue(new Error('mail down')) }), good);
    expect(r.body).toEqual({ ok: true, created: true });
    await new Promise(resolve => setTimeout(resolve, 0));
    err.mockRestore();
  });

  it('says who, how to reach them on WhatsApp, and how many are on the list', () => {
    const mail = waitlistEmail(entry, { total: 12, at: Date.UTC(2026, 9, 31, 6, 30) });
    expect(mail.subject).toBe('New waitlist sign-up: Asha Rao (Tiffin service, Pune)');
    expect(mail.text).toContain('WhatsApp: +91 98765 43210');
    expect(mail.text).toContain('https://wa.me/919876543210');
    expect(mail.text).toContain('12 people are on the waitlist now.');
    expect(mail.text).toMatch(/Signed up: 31 Oct 2026, 12:00\s?pm IST/i);
  });

  it('gives an email address as it is, and says what was not given', () => {
    const mail = waitlistEmail({ name: 'Ravi', contact: 'ravi@example.com', contactType: 'email', business: null, city: null }, { total: 1, at: 0 });
    expect(mail.subject).toBe('New waitlist sign-up: Ravi');
    expect(mail.text).toContain('Email: ravi@example.com');
    expect(mail.text).toContain('Business: not given');
    expect(mail.text).toContain('1 person is on the waitlist now.');
  });
});

describe('createEmailSender', () => {
  it('sends through Resend with the key on the server', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    const send = createEmailSender({ apiKey: () => ' re_key ', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await send({ to: 'stockpot.app@gmail.com', subject: 'Hi', text: 'Body' })).toBe('sent');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(RESEND_URL);
    expect(init.headers.Authorization).toBe('Bearer re_key');
    expect(JSON.parse(init.body)).toEqual({ from: DEFAULT_EMAIL_FROM, to: ['stockpot.app@gmail.com'], subject: 'Hi', text: 'Body' });
  });

  it('skips without a key, and reports a refusal without throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = vi.fn();
    expect(await createEmailSender({ apiKey: () => undefined, fetchImpl: fetchImpl as unknown as typeof fetch })({ to: 'a@b.co', subject: 's', text: 't' })).toBe('skipped');
    expect(fetchImpl).not.toHaveBeenCalled();
    const refused = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => 'You can only send testing emails to your own email address' });
    expect(await createEmailSender({ apiKey: () => 'k', fetchImpl: refused as unknown as typeof fetch })({ to: 'a@b.co', subject: 's', text: 't' })).toBe('failed');
    expect(await createEmailSender({ apiKey: () => 'k', fetchImpl: vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch })({ to: 'a@b.co', subject: 's', text: 't' })).toBe('failed');
    warn.mockRestore(); err.mockRestore();
  });
});
