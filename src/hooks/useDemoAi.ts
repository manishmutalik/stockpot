/**
 * useDemoAi.ts
 *
 * The demo kitchen's stand-ins for the AI readers (utils/demoAi): the same interfaces as useOrderParser,
 * useProductionParser, useRecipeReader and usePromote, so the screens work unchanged, but each one answers its ready
 * example from the saved reading, after a short pause like a real one, and tells a visitor who gives it anything else
 * that the demo reads the example (DEMO_OWN_INPUT). Nothing is sent anywhere. Null outside the demo.
 */
import { useEffect, useMemo, useRef } from 'react';
import type { BakerySettings, MenuItem, Order, RawMaterial } from '../types';
import type { OrderParser } from './useOrderParser';
import type { ProductionParser } from './useProductionParser';
import type { RecipeReader } from './useRecipeReader';
import type { Promoter } from './usePromote';
import { buildCustomerProfiles } from '../utils/customers';
import { buildOrderForm, prepareOrderText } from '../utils/orderParse';
import { buildProductionForm } from '../utils/productionParse';
import { orderLine } from '../utils/promote';
import { todayInZone } from '../utils/localDate';
import {
  DEMO_BAKE, DEMO_BAKE_READING, DEMO_ORDER, DEMO_OWN_INPUT, DEMO_PROMOTE_PHOTO, DEMO_PROMOTE_READINGS, DEMO_RECIPE,
  DEMO_RECIPE_PHOTO, DEMO_RECIPE_READING, demoOrderReading, isDemoText,
} from '../utils/demoAi';

/** How long a demo reading takes, so it feels like the real thing rather than a jump. */
export const DEMO_READ_MS = 900;

export interface DemoAi {
  orderParser: OrderParser;
  productionParser: ProductionParser;
  recipeReader: RecipeReader;
  promoter: Promoter;
}

/** One of the demo's example files (public/demo), as a File named so the demo knows it. */
export async function loadDemoFile(spec: { url: string; fileName: string; type: string }): Promise<File> {
  const res = await fetch(spec.url);
  const blob = await res.blob();
  return new File([blob], spec.fileName, { type: spec.type });
}

/** A photo as base64 with its size, for a Promote result. */
async function photoData(file: File): Promise<{ image: string; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d')?.drawImage(img, 0, 0);
    const data = canvas.toDataURL('image/jpeg', 0.9);
    return { image: data.slice(data.indexOf(',') + 1), width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function useDemoAi(input: {
  enabled: boolean;
  orders: Order[];
  /** Items sold on the menu (what an order can be for). */
  saleMenu: MenuItem[];
  menu: MenuItem[];
  materials: (RawMaterial & { remaining: number })[];
  settings: BakerySettings;
  /** For tests. */
  delayMs?: number;
}): DemoAi | null {
  const latest = useRef(input);
  useEffect(() => { latest.current = input; });
  const { enabled } = input;

  return useMemo(() => {
    if (!enabled) return null;
    const pause = () => new Promise(resolve => setTimeout(resolve, latest.current.delayMs ?? DEMO_READ_MS));
    const own = { ok: false as const, message: DEMO_OWN_INPUT };

    const orderParser: OrderParser = {
      parse: async message => {
        await pause();
        if (!isDemoText(message, DEMO_ORDER.text)) return own;
        const { orders, saleMenu, materials, settings } = latest.current;
        const today = todayInZone(settings.timezone);
        // Prepared as a real message is, so the customer gets the same label the reading refers to.
        const customers = buildCustomerProfiles({ orders, menu: saleMenu, materials, settings, today });
        const prepared = prepareOrderText(message, customers);
        const form = buildOrderForm({
          parsed: demoOrderReading(prepared.mentioned[0]), menu: saleMenu, today, phones: prepared.phones,
          customers: customers.map(c => ({ label: c.label, name: c.name, phone: c.phone })),
        });
        return { ok: true, form };
      },
    };

    const productionParser: ProductionParser = {
      parse: async message => {
        await pause();
        if (!isDemoText(message, DEMO_BAKE.text)) return own;
        const { menu, settings } = latest.current;
        return { ok: true, form: buildProductionForm({ parsed: DEMO_BAKE_READING, menu, today: todayInZone(settings.timezone) }) };
      },
    };

    const recipeReader: RecipeReader = {
      remaining: null,
      read: async read => {
        await pause();
        const isExample = 'text' in read
          ? isDemoText(read.text, DEMO_RECIPE.text)
          : read.photos.length === 1 && read.photos[0].name === DEMO_RECIPE_PHOTO.fileName;
        return isExample ? { ok: true, parsed: structuredClone(DEMO_RECIPE_READING) } : own;
      },
    };

    const promoter: Promoter = {
      remaining: null,
      promote: async (photo, language) => {
        await pause();
        if (photo.name !== DEMO_PROMOTE_PHOTO.fileName) return own;
        try {
          const data = await photoData(photo);
          return { ok: true, result: { ...data, reading: DEMO_PROMOTE_READINGS[language], orderLine: orderLine(latest.current.settings.phone) } };
        } catch {
          return { ok: false, message: 'The demo photo could not be opened. Please try again.' };
        }
      },
      // Styled photos need a real account: the demo leaves them out.
      styling: null,
    };

    return { orderParser, productionParser, recipeReader, promoter };
  }, [enabled]);
}
