/**
 * auth.ts
 *
 * Verifies the Firebase ID token sent by the client (Authorization: Bearer
 * <token>) so that server routes know *which* authenticated user is making
 * the request. Without this, /api/shopify and /api/odoo routes had no way to
 * know who they were acting on behalf of — they just trusted whatever cookie
 * arrived, which isn't tied to the Firestore-authenticated user at all.
 *
 * Requires a Firebase service account. Set GOOGLE_APPLICATION_CREDENTIALS to
 * the path of a service account JSON file, or set
 * FIREBASE_SERVICE_ACCOUNT_JSON to the JSON contents directly (handy for
 * platforms where you can't mount a file, e.g. most PaaS secret managers).
 */
import type { Request, Response, NextFunction } from 'express';
import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  const inlineServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  initializeApp({
    credential: inlineServiceAccount
      ? cert(JSON.parse(inlineServiceAccount))
      : applicationDefault(),
  });
}

export interface AuthedRequest extends Request {
  uid?: string;
  /** The account email on the token, if there is one. Firebase includes it even when it has not been verified. */
  email?: string;
  /** True only when Firebase has verified that the account owns `email`. */
  emailVerified?: boolean;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  try {
    const decoded = await getAuth().verifyIdToken(token);
    req.uid = decoded.uid;
    req.email = decoded.email;
    req.emailVerified = decoded.email_verified === true;
    next();
  } catch (err) {
    console.error('Auth verification failed:', err instanceof Error ? err.message : err);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
