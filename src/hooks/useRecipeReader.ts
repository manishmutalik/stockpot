/**
 * useRecipeReader.ts
 *
 * Reading recipes from typed or pasted text, or from photos, for the Recipes & Menus tab. Offered only to accounts
 * AI is available to (never the demo). Photos are shrunk on this device before they are sent (the longest side to
 * RECIPE_PHOTO_MAX_SIDE, as JPEG), which keeps them quick to send and cheaper to read; they are not kept anywhere.
 * Nothing is saved here: the answer fills the check screen (utils/recipeDraft) and the owner presses Save.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RawMaterial } from '../types';
import { apiFetch } from '../utils/apiClient';
import { prepareRecipeText, RECIPE_MAX_MATERIALS, RECIPE_MAX_PHOTOS, RECIPE_PHOTO_MAX_SIDE, type ParsedRecipes, type RecipePhoto } from '../utils/recipeParse';

export type RecipeReadOutcome =
  | { ok: true; parsed: ParsedRecipes; remaining?: number }
  | { ok: false; message: string; remaining?: number };

export interface RecipeReader {
  /** Recipes that can still be read today (and this month), as of the last check. */
  remaining: number | null;
  read: (input: { text: string } | { photos: File[] }, materials: RawMaterial[]) => Promise<RecipeReadOutcome>;
}

/** A photo from the device, shrunk and re-encoded as JPEG; it fails for a type the browser cannot open (HEIC on most). */
export async function shrinkPhoto(file: File, maxSide = RECIPE_PHOTO_MAX_SIDE): Promise<RecipePhoto> {
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('unreadable'); });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('unreadable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { mediaType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1) };
}

export function useRecipeReader(input: { signedIn: boolean; dataReady: boolean }): RecipeReader | null {
  const [available, setAvailable] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const asked = useRef(false);
  const alive = useRef(true);
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
        if (!alive.current || status.available !== true || !status.limits?.recipe) return;
        setAvailable(true);
        if (typeof status.limits.recipe.remaining === 'number') setRemaining(status.limits.recipe.remaining);
      } catch {
        // Not reachable: the option simply does not appear.
      }
    })();
  }, [input.signedIn, input.dataReady]);

  const read = useCallback(async (source: { text: string } | { photos: File[] }, materials: RawMaterial[]): Promise<RecipeReadOutcome> => {
    const list = materials.slice(0, RECIPE_MAX_MATERIALS).map(m => ({ id: m.id, name: (m.name || '').slice(0, 80) || 'Material', unit: m.unit || 'g' }));
    let payload: Record<string, unknown>;
    if ('text' in source) {
      const text = prepareRecipeText(source.text);
      if (text.trim() === '') return { ok: false, message: 'Type or paste a recipe first.' };
      payload = { text, materials: list };
    } else {
      if (source.photos.length === 0) return { ok: false, message: 'Add a photo of the recipe first.' };
      if (source.photos.length > RECIPE_MAX_PHOTOS) return { ok: false, message: `Up to ${RECIPE_MAX_PHOTOS} photos at a time.` };
      try {
        payload = { photos: await Promise.all(source.photos.map(f => shrinkPhoto(f))), materials: list };
      } catch {
        return { ok: false, message: 'That photo could not be opened here. Try a JPEG or PNG photo, or a screenshot.' };
      }
    }

    let body: Record<string, unknown>;
    let status: number;
    try {
      const res = await apiFetch('/api/ai/parse-recipe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      status = res.status;
      body = await res.json().catch(() => ({}));
    } catch {
      return { ok: false, message: 'The assistant could not be reached. Please try again.' };
    }
    const left = typeof body.remaining === 'number' ? body.remaining : undefined;
    if (left !== undefined && alive.current) setRemaining(left);
    if (status === 429 && alive.current) setRemaining(0);
    if (status >= 200 && status < 300 && body.parsed) {
      const parsed = body.parsed as ParsedRecipes;
      if (parsed.recipes.length === 0) return { ok: false, message: 'No recipe was found in that. Check the photo shows the ingredients, or type the recipe.', remaining: left };
      return { ok: true, parsed, remaining: left };
    }
    return { ok: false, message: typeof body.error === 'string' ? body.error : 'That recipe could not be read right now.', remaining: left };
  }, []);

  return available ? { remaining, read } : null;
}
