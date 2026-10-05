/**
 * useProductionParser.ts
 *
 * Reading a pasted or typed note about what was made ("made 40 croissants this
 * morning, 3 burnt") into the Log Production Run form. Offered only to accounts
 * AI is available to (never the demo). The note is prepared on this device before
 * it is sent (phone numbers removed; see utils/productionParse), and the server's
 * answer is turned into form values here, with the date worked out by code. Nothing
 * is saved: the owner checks the filled form and presses Log Run.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BakerySettings, MenuItem } from '../types';
import { apiFetch } from '../utils/apiClient';
import { todayInZone } from '../utils/localDate';
import { buildProductionForm, prepareProductionText, PRODUCTION_MAX_MENU_ITEMS, type ParsedProduction, type ProductionFormFill } from '../utils/productionParse';

export type ProductionParseOutcome = { ok: true; form: ProductionFormFill; remaining?: number } | { ok: false; message: string };

export interface ProductionParser {
  parse: (message: string) => Promise<ProductionParseOutcome>;
}

export function useProductionParser(input: {
  menu: MenuItem[];
  settings: BakerySettings;
  signedIn: boolean;
  dataReady: boolean;
}): ProductionParser | null {
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

  const parse = useCallback(async (message: string): Promise<ProductionParseOutcome> => {
    const { menu, settings } = latest.current;
    if (menu.length === 0) return { ok: false, message: 'Add something to the menu first, so there is something to match the note to.' };
    const text = prepareProductionText(message);
    if (text.trim() === '') return { ok: false, message: 'Write or paste what you made first.' };

    let body: any;
    let status: number;
    try {
      const res = await apiFetch('/api/ai/parse-production-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          menuItems: menu.slice(0, PRODUCTION_MAX_MENU_ITEMS).map(m => ({ id: m.id, name: m.name.slice(0, 80) })),
        }),
      });
      status = res.status;
      body = await res.json().catch(() => ({}));
    } catch {
      return { ok: false, message: 'The assistant could not be reached. Please try again.' };
    }
    if (status >= 200 && status < 300 && body.parsed) {
      const form = buildProductionForm({ parsed: body.parsed as ParsedProduction, menu, today: todayInZone(settings.timezone) });
      return { ok: true, form, remaining: typeof body.remaining === 'number' ? body.remaining : undefined };
    }
    return { ok: false, message: typeof body.error === 'string' ? body.error : 'That note could not be read right now.' };
  }, []);

  return available ? { parse } : null;
}
