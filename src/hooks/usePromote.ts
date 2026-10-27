/**
 * usePromote.ts
 *
 * Promote on the website: a photo of a dish is shrunk on this device (to PROMOTE_PHOTO_MAX_SIDE, as JPEG), sent to
 * POST /api/ai/promote, and comes back improved with a caption and hashtags (utils/promote). Offered only to accounts
 * AI is available to (never the demo). Nothing is kept: the photo lives in this page until the owner leaves it.
 *
 * Styled photo (utils/promoteStyles) is offered when the server has it (its AI status lists `style`): the improved photo
 * goes to POST /api/ai/promote/style with a style and the shape chosen, and comes back restyled by AI.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../utils/apiClient';
import { cropRect, PROMOTE_PHOTO_MAX_SIDE, type Focus, type PromoteLanguage, type PromoteResult, type PromoteShape, type PromoteShapeId } from '../utils/promote';
import type { StyleResult } from '../utils/promoteStyles';
import { shrinkPhoto } from './useRecipeReader';

export type PromoteOutcome = { ok: true; result: PromoteResult } | { ok: false; message: string };
export type StyleOutcome = { ok: true; result: StyleResult } | { ok: false; message: string };

export interface Promoter {
  /** Photos that can still be promoted today, as of the last check. */
  remaining: number | null;
  promote: (photo: File, language: PromoteLanguage) => Promise<PromoteOutcome>;
  /** Null when the server has no Styled photo. */
  styling: { left: number | null; style: (image: string, style: string, shape: PromoteShapeId) => Promise<StyleOutcome> } | null;
}

/** The improved photo cut to a shape (a post or a story) around the food, at the shape's size, as a JPEG file. */
export async function cropToShape(imageBase64: string, shape: PromoteShape, focus: Focus, name: string): Promise<File> {
  const img = new Image();
  img.src = `data:image/jpeg;base64,${imageBase64}`;
  await img.decode();
  const r = cropRect(img.naturalWidth, img.naturalHeight, shape, focus);
  const canvas = document.createElement('canvas');
  canvas.width = shape.width;
  canvas.height = shape.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, r.x, r.y, r.width, r.height, 0, 0, shape.width, shape.height);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('no image');
  return new File([blob], name, { type: 'image/jpeg' });
}

export function usePromote(input: { signedIn: boolean; dataReady: boolean }): Promoter | null {
  const [available, setAvailable] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [hasStyling, setHasStyling] = useState(false);
  const [stylesLeft, setStylesLeft] = useState<number | null>(null);
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
        if (!alive.current || status.available !== true || !status.limits?.promote) return;
        setAvailable(true);
        if (typeof status.limits.promote.remaining === 'number') setRemaining(status.limits.promote.remaining);
        if (status.limits.style) {
          setHasStyling(true);
          if (typeof status.limits.style.remaining === 'number') setStylesLeft(status.limits.style.remaining);
        }
      } catch {
        // Not reachable: the section simply does not appear.
      }
    })();
  }, [input.signedIn, input.dataReady]);

  const promote = useCallback(async (file: File, language: PromoteLanguage): Promise<PromoteOutcome> => {
    let photo;
    try {
      photo = await shrinkPhoto(file, PROMOTE_PHOTO_MAX_SIDE);
    } catch {
      return { ok: false, message: 'That photo could not be opened here. Try a JPEG or PNG photo.' };
    }
    let body: Record<string, unknown>;
    let status: number;
    try {
      const res = await apiFetch('/api/ai/promote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photo, language }) });
      status = res.status;
      body = await res.json().catch(() => ({}));
    } catch {
      return { ok: false, message: 'The assistant could not be reached. Please try again.' };
    }
    const result = body.result as PromoteResult | null | undefined;
    const left = typeof body.remaining === 'number' ? body.remaining : result?.remaining;
    if (typeof left === 'number' && alive.current) setRemaining(left);
    if (status === 429 && alive.current) setRemaining(0);
    if (status >= 200 && status < 300 && result) return { ok: true, result };
    return { ok: false, message: typeof body.error === 'string' ? body.error : 'That post could not be made right now.' };
  }, []);

  const style = useCallback(async (image: string, styleId: string, shape: PromoteShapeId): Promise<StyleOutcome> => {
    let body: Record<string, unknown>;
    let status: number;
    try {
      const res = await apiFetch('/api/ai/promote/style', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: { mediaType: 'image/jpeg', data: image }, style: styleId, shape }),
      });
      status = res.status;
      body = await res.json().catch(() => ({}));
    } catch {
      return { ok: false, message: 'The photo could not be styled. Please try again.' };
    }
    const result = body.result as StyleResult | undefined;
    const left = typeof result?.stylesLeft === 'number' ? result.stylesLeft : typeof body.stylesLeft === 'number' ? body.stylesLeft : undefined;
    if (left !== undefined && alive.current) setStylesLeft(left);
    if (status === 429 && body.code === 'monthly_limit' && alive.current) setStylesLeft(0);
    if (status >= 200 && status < 300 && result) return { ok: true, result };
    return { ok: false, message: typeof body.error === 'string' ? body.error : 'The photo could not be styled. Please try again.' };
  }, []);

  return available ? { remaining, promote, styling: hasStyling ? { left: stylesLeft, style } : null } : null;
}
