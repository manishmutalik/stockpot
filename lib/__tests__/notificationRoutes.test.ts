// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { createNotificationRunHandler, secretMatches } from '../notificationRoutes';

const SECRET = 'a-long-shared-secret-value';
const summary = { users: 2, notifications: 1, delivered: 1, released: 0, errors: 0 };
const res = () => { const r: any = { code: 200 }; r.status = (c: number) => { r.code = c; return r; }; r.json = (b: any) => { r.body = b; return r; }; return r; };
const call = async (handler: any, authorization?: string) => { const r = res(); await handler({ headers: authorization ? { authorization } : {} } as any, r); return r; };

describe('secretMatches', () => {
  it('is true only for the same string', () => {
    expect(secretMatches(SECRET, SECRET)).toBe(true);
    expect(secretMatches(SECRET.slice(0, -1), SECRET)).toBe(false);
    expect(secretMatches(`${SECRET}x`, SECRET)).toBe(false);
    expect(secretMatches('', SECRET)).toBe(false);
  });
});

describe('POST /internal/notifications/run', () => {
  it('runs the job for the right secret and says what it did', async () => {
    const run = vi.fn().mockResolvedValue(summary);
    const r = await call(createNotificationRunHandler({ secret: () => SECRET, run }), `Bearer ${SECRET}`);
    expect(r.code).toBe(200);
    expect(r.body).toEqual(summary);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('is off until a secret is set, and refuses a short one', async () => {
    for (const secret of [undefined, '', 'short']) {
      const run = vi.fn();
      const r = await call(createNotificationRunHandler({ secret: () => secret, run }), `Bearer ${secret}`);
      expect(r.code).toBe(503);
      expect(r.body.code).toBe('not_configured');
      expect(run).not.toHaveBeenCalled();
    }
  });

  it('refuses a missing or wrong secret', async () => {
    const run = vi.fn();
    const handler = createNotificationRunHandler({ secret: () => SECRET, run });
    for (const header of [undefined, 'Bearer nope', SECRET, `Basic ${SECRET}`, 'Bearer ']) {
      expect((await call(handler, header)).code, String(header)).toBe(401);
    }
    expect(run).not.toHaveBeenCalled();
  });

  it('refuses a run that starts while another is going, then allows the next', async () => {
    let finish!: (s: typeof summary) => void;
    const run = vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const handler = createNotificationRunHandler({ secret: () => SECRET, run });
    const first = call(handler, `Bearer ${SECRET}`);
    const second = await call(handler, `Bearer ${SECRET}`);
    expect(second.code).toBe(409);
    finish(summary);
    expect((await first).code).toBe(200);
    run.mockResolvedValue(summary);
    expect((await call(handler, `Bearer ${SECRET}`)).code).toBe(200);
  });

  it('answers 500, and can run again, when the job throws', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(summary);
    const handler = createNotificationRunHandler({ secret: () => SECRET, run });
    expect((await call(handler, `Bearer ${SECRET}`)).code).toBe(500);
    expect((await call(handler, `Bearer ${SECRET}`)).code).toBe(200);
  });
});
