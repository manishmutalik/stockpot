/**
 * invoice.ts
 *
 * Asking the server for an order's invoice (the text to send, the link to the bill online and a WhatsApp link when the order
 * has a phone number). The server writes the text, so it is the same wherever the button is.
 */
import type { InvoiceResponse } from '../../../src/utils/quickApiTypes';
import type { Api } from './api';

export const invoicePath = (orderId: string) => `/api/mobile/orders/${encodeURIComponent(orderId)}/invoice`;

export const requestInvoice = (api: Pick<Api, 'post'>, orderId: string): Promise<InvoiceResponse> => api.post<InvoiceResponse>(invoicePath(orderId));
