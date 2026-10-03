import { describe, it, expect, vi, beforeEach } from 'vitest';

const verifyIdToken = vi.fn();
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), applicationDefault: vi.fn(), cert: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken }) }));

import { requireAuth } from '../auth';

const res = () => { const r: any = { code: 200 }; r.status = (c: number) => { r.code = c; return r; }; r.json = (b: any) => { r.body = b; return r; }; return r; };
beforeEach(() => { verifyIdToken.mockReset(); });

describe('requireAuth', () => {
  it('sets the uid and the verified email from the token', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'u1', email: 'asha@example.com', email_verified: true });
    const req: any = { headers: { authorization: 'Bearer abc' } };
    const next = vi.fn();
    await requireAuth(req, res(), next);
    expect(verifyIdToken).toHaveBeenCalledWith('abc');
    expect(req.uid).toBe('u1');
    expect(req.email).toBe('asha@example.com');
    expect(req.emailVerified).toBe(true);
    expect(next).toHaveBeenCalled();
  });

  it('does not treat an unverified email as verified', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'u3', email: 'asha@example.com', email_verified: false });
    const req: any = { headers: { authorization: 'Bearer abc' } };
    await requireAuth(req, res(), vi.fn());
    expect(req.email).toBe('asha@example.com');
    expect(req.emailVerified).toBe(false);
    verifyIdToken.mockResolvedValue({ uid: 'u4', email: 'a@b.com' });
    const req2: any = { headers: { authorization: 'Bearer abc' } };
    await requireAuth(req2, res(), vi.fn());
    expect(req2.emailVerified).toBe(false);
  });

  it('copes with a token that has no email', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'u2' });
    const req: any = { headers: { authorization: 'Bearer abc' } };
    await requireAuth(req, res(), vi.fn());
    expect(req.uid).toBe('u2');
    expect(req.email).toBeUndefined();
  });

  it('refuses a missing or invalid token', async () => {
    const r1 = res(); const next = vi.fn();
    await requireAuth({ headers: {} } as any, r1, next);
    expect(r1.code).toBe(401);
    verifyIdToken.mockRejectedValue(new Error('bad'));
    const r2 = res();
    await requireAuth({ headers: { authorization: 'Bearer x' } } as any, r2, next);
    expect(r2.code).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
