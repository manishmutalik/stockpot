import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createWaitlistHandler, WAITLIST_LIMIT, waitlistId, type WaitlistStore } from '../waitlistRoutes';

interface Answer { code: number; body: Record<string, unknown> }
const res = () => {
  const r = { code: 200, body: {} } as Answer & { status: (c: number) => unknown; json: (b: Record<string, unknown>) => unknown };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; };
  return r;
};
const store = (created = true) => ({ save: vi.fn<WaitlistStore['save']>().mockResolvedValue({ created }) });
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
