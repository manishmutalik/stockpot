/**
 * billRoutes.ts
 *
 * Express handlers for bills, with their data access injected so they can be
 * tested without Firebase. Wired up in server.ts.
 */
import type { Request, Response } from 'express';
import { isValidBillToken, type Bill } from '../src/utils/billing';
import { NOT_FOUND_HTML, renderBillHtml } from './billHtml';
import type { AuthedRequest } from './auth';

/**
 * GET /bill/:token (public, no sign-in). A malformed token, an unknown token
 * and a missing bill all give the same 404 page, so the response never
 * reveals whether an order or bill exists.
 */
export function createPublicBillHandler(getBill: (token: string) => Promise<Bill | null>) {
  return async (req: Request, res: Response) => {
    res.set({
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    });
    const token = req.params.token;
    if (!isValidBillToken(token)) return res.status(404).type('html').send(NOT_FOUND_HTML);
    try {
      const bill = await getBill(token);
      if (!bill) return res.status(404).type('html').send(NOT_FOUND_HTML);
      return res.status(200).type('html').send(renderBillHtml(bill));
    } catch (err: any) {
      console.error('Failed to load public bill:', err?.message);
      return res.status(500).type('html').send(NOT_FOUND_HTML);
    }
  };
}

/** POST /api/bills (signed in): creates or refreshes the bill for the owner's order. */
export function createBillHandler(
  createBill: (uid: string, orderId: string) => Promise<{ token: string; bill: Bill } | null>
) {
  return async (req: AuthedRequest, res: Response) => {
    const orderId = req.body?.orderId;
    if (typeof orderId !== 'string' || !orderId || orderId.includes('/')) {
      return res.status(400).json({ error: 'Missing orderId' });
    }
    try {
      const result = await createBill(req.uid!, orderId);
      if (!result) return res.status(404).json({ error: 'Order not found' });
      return res.json(result);
    } catch (err: any) {
      console.error('Failed to create bill:', err?.message);
      return res.status(500).json({ error: 'Failed to create bill' });
    }
  };
}
