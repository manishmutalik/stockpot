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
 * reveals whether an order or bill exists. The only form a bill page has is
 * "I've paid by UPI", which posts back to this site (`form-action 'self'`).
 */
export const PUBLIC_BILL_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'",
} as const;

export function createPublicBillHandler(getBill: (token: string) => Promise<Bill | null>) {
  return async (req: Request, res: Response) => {
    res.set(PUBLIC_BILL_HEADERS);
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

const MAX_STATEMENT_ORDERS = 200;
const validId = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 200 && !id.includes('/');

/**
 * POST /api/bills (signed in): creates or refreshes a bill for the owner's
 * order ({ orderId }), or a consolidated statement for several of their
 * pending orders ({ orderIds: [...] }).
 */
export function createBillHandler(
  createBill: (uid: string, orderId: string) => Promise<{ token: string; bill: Bill } | null>,
  createStatement?: (uid: string, orderIds: string[]) => Promise<{ token: string; bill: Bill } | null>
) {
  return async (req: AuthedRequest, res: Response) => {
    const { orderId, orderIds } = req.body ?? {};
    const isStatement = orderIds !== undefined;
    if (isStatement) {
      if (!createStatement || !Array.isArray(orderIds) || orderIds.length === 0 || orderIds.length > MAX_STATEMENT_ORDERS || !orderIds.every(validId)) {
        return res.status(400).json({ error: 'Invalid orderIds' });
      }
    } else if (!validId(orderId)) {
      return res.status(400).json({ error: 'Missing orderId' });
    }
    try {
      const result = isStatement
        ? await createStatement!(req.uid!, [...new Set(orderIds as string[])])
        : await createBill(req.uid!, orderId);
      if (!result) return res.status(404).json({ error: 'Order not found' });
      return res.json(result);
    } catch (err: any) {
      console.error('Failed to create bill:', err?.message);
      return res.status(500).json({ error: 'Failed to create bill' });
    }
  };
}
