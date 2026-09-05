/**
 * csrf.ts
 *
 * Double-submit-cookie CSRF protection for state-changing routes
 * (POST /api/odoo/connect, /api/odoo/disconnect, /api/shopify/disconnect).
 *
 * Flow: client GETs /api/session/csrf once per session, gets a token back in
 * both a cookie and the JSON body, then must echo that token in an
 * X-CSRF-Token header on every state-changing request. A cross-site attacker
 * can make the browser send the cookie automatically, but cannot read it to
 * put it in the header — that's what defeats the forgery.
 */
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

const CSRF_COOKIE = 'csrf_token';

export function issueCsrfToken(req: Request, res: Response) {
  const token = crypto.randomBytes(24).toString('hex');
  // Not httpOnly: the client needs to read this cookie's value via JS to echo
  // it back in a header. That's expected for the double-submit pattern.
  // `secure` is only forced in production — browsers silently drop `secure`
  // cookies over plain http, which is exactly what local dev uses.
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  res.json({ csrfToken: token });
}

export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  const cookieToken = req.cookies[CSRF_COOKIE];
  const headerToken = req.headers['x-csrf-token'];
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token' });
  }
  next();
}
