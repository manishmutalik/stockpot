/**
 * useOrderParser.ts
 *
 * Reading a pasted order message into the Add Order form. Offered only to
 * accounts AI is available to (never the demo). The message is prepared on this
 * device before it is sent (phone numbers removed, known customers' names
 * replaced by labels; see utils/orderParse), and the server's answer is turned
 * into form values here, with a known customer's name and phone number taken
 * from their own record.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BakerySettings, MenuItem, Order, RawMaterial } from '../types';
import { apiFetch } from '../utils/apiClient';
import { buildCustomerProfiles } from '../utils/customers';
import { todayInZone } from '../utils/localDate';
import { buildOrderForm, prepareOrderText, ORDER_MAX_MENU_ITEMS, type OrderFormFill, type ParsedOrder } from '../utils/orderParse';

export type OrderParseOutcome = { ok: true; form: OrderFormFill; remaining?: number } | { ok: false; message: string };

export interface OrderParser {
  parse: (message: string) => Promise<OrderParseOutcome>;
}

export function useOrderParser(input: {
  orders: Order[];
  menu: MenuItem[];
  materials: (RawMaterial & { remaining: number })[];
  settings: BakerySettings;
  signedIn: boolean;
  dataReady: boolean;
}): OrderParser | null {
  const [available, setAvailable] = useState(false);
  const asked = useRef(false);
  const alive = useRef(true);
  const latest = useRef(input);
  useEffect(() => { latest.current = input; });
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    if (!input.signedIn || !input.dataReady || asked.current) return;
    asked.current = true;
    (async () => {
      try {
        const res = await apiFetch('/api/ai/status');
        if (!res.ok) return;
        const status = await res.json();
        if (alive.current && status.available === true) setAvailable(true);
      } catch {
        // Not reachable: the option simply does not appear.
      }
    })();
  }, [input.signedIn, input.dataReady]);

  const parse = useCallback(async (message: string): Promise<OrderParseOutcome> => {
    const { orders, menu, materials, settings } = latest.current;
    if (menu.length === 0) return { ok: false, message: 'Add something to the menu first, so there is something to match the message to.' };
    const today = todayInZone(settings.timezone);
    const customers = buildCustomerProfiles({ orders, menu, materials, settings, today });
    const prepared = prepareOrderText(message, customers);
    if (prepared.text.trim() === '') return { ok: false, message: 'Paste the customer\'s message first.' };

    let body: any;
    let status: number;
    try {
      const res = await apiFetch('/api/ai/parse-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: prepared.text,
          menuItems: menu.slice(0, ORDER_MAX_MENU_ITEMS).map(m => ({ id: m.id, name: m.name.slice(0, 80) })),
        }),
      });
      status = res.status;
      body = await res.json().catch(() => ({}));
    } catch {
      return { ok: false, message: 'The assistant could not be reached. Please try again.' };
    }
    if (status >= 200 && status < 300 && body.parsed) {
      const form = buildOrderForm({
        parsed: body.parsed as ParsedOrder, menu, today, phones: prepared.phones,
        customers: customers.map(c => ({ label: c.label, name: c.name, phone: c.phone })),
      });
      return { ok: true, form, remaining: typeof body.remaining === 'number' ? body.remaining : undefined };
    }
    return { ok: false, message: typeof body.error === 'string' ? body.error : 'That message could not be read right now.' };
  }, []);

  return available ? { parse } : null;
}
