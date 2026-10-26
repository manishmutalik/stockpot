/**
 * promoteImage.ts
 *
 * Promote's photo improvement: what an owner would do by hand in a photo editor, done the same way every time, by
 * code, so the food in the picture stays the food that is served (no model redraws it):
 *  - turned the right way up (from the camera's EXIF) and shrunk to PROMOTE_PHOTO_MAX_SIDE at most;
 *  - white balance from the brightest parts of the photo (usually the plate or the table cloth, which should be
 *    white), part of the way, so a yellow kitchen bulb or a blue tube light is mostly taken out. Not from the average
 *    of the whole photo: a plate of curry is meant to be orange, and correcting it to grey turns the plate green;
 *  - exposure: a dark photo is brightened towards a normal middle grey, without letting the highlights burn out;
 *  - a little more saturation, sharpened a little, saved as JPEG with the camera's metadata (and its GPS position)
 *    left out.
 * Also the smaller copy the model looks at.
 */
import sharp from 'sharp';
import { PROMOTE_MODEL_SIDE, PROMOTE_PHOTO_MAX_SIDE } from '../src/utils/promote';

export interface ImprovedPhoto { image: Buffer; width: number; height: number; forModel: Buffer }

/** How far the white balance goes towards making the brightest parts neutral (1 = all the way). */
const BALANCE_STRENGTH = 0.6;
/** No channel is changed by more than this much by the white balance. */
const MAX_GAIN = 0.15;
/** Brightening never multiplies by more than this, and the brightest 1% is kept below HIGHLIGHT. */
const MAX_EXPOSURE = 1.5;
const HIGHLIGHT = 248;
const MID_GREY = 118;

export interface Adjustment { gains: [number, number, number]; offset: number }

const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** The value below which `fraction` of the sorted values lie. */
const percentile = (sorted: number[], fraction: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(fraction * sorted.length)))];

/**
 * The per-channel multipliers and the common offset (out = in × gain + offset) for a photo, from its pixels (RGB,
 * 3 bytes each; a small copy is plenty).
 */
export function adjustmentFor(pixels: Uint8Array | Buffer): Adjustment {
  const count = Math.floor(pixels.length / 3);
  if (count === 0) return { gains: [1, 1, 1], offset: 0 };
  const lumas: number[] = new Array(count);
  for (let i = 0; i < count; i++) lumas[i] = luma(pixels[i * 3], pixels[i * 3 + 1], pixels[i * 3 + 2]);
  const sorted = [...lumas].sort((a, b) => a - b);

  // White balance: the average colour of the brightest 5% that is not burnt out.
  const bright = percentile(sorted, 0.95);
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < count; i++) {
    const [pr, pg, pb] = [pixels[i * 3], pixels[i * 3 + 1], pixels[i * 3 + 2]];
    if (lumas[i] >= bright && Math.max(pr, pg, pb) < 254) { r += pr; g += pg; b += pb; n++; }
  }
  let gains: [number, number, number] = [1, 1, 1];
  if (n > 0 && r > 0 && g > 0 && b > 0) {
    const grey = (r + g + b) / 3;
    const clamp = (v: number) => Math.min(Math.max(v, 1 - MAX_GAIN), 1 + MAX_GAIN);
    gains = [r, g, b].map(c => clamp(1 + BALANCE_STRENGTH * (grey / c - 1))) as [number, number, number];
  }

  // Exposure: black point to the darkest 0.5% (but never more than 16), then brighten towards a middle grey for the
  // median, as far as the highlights allow.
  const black = Math.min(percentile(sorted, 0.005), 16);
  const median = percentile(sorted, 0.5) - black;
  const top = percentile(sorted, 0.99) - black;
  const wanted = median > 0 ? MID_GREY / median : 1;
  const allowed = top > 0 ? HIGHLIGHT / top : 1;
  const exposure = Math.max(1, Math.min(wanted, allowed, MAX_EXPOSURE));
  return { gains: gains.map(x => x * exposure) as [number, number, number], offset: -black * exposure };
}

export async function improvePhoto(input: Buffer): Promise<ImprovedPhoto> {
  const sample = await sharp(input).rotate().resize(256, 256, { fit: 'inside' }).removeAlpha().toColourspace('srgb').raw().toBuffer();
  const { gains, offset } = adjustmentFor(sample);

  const { data: image, info } = await sharp(input)
    .rotate()
    .resize({ width: PROMOTE_PHOTO_MAX_SIDE, height: PROMOTE_PHOTO_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .toColourspace('srgb')
    .linear(gains, [offset, offset, offset])
    .modulate({ saturation: 1.12 })
    .sharpen({ sigma: 0.8 })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const forModel = await sharp(image).resize(PROMOTE_MODEL_SIDE, PROMOTE_MODEL_SIDE, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  return { image, width: info.width, height: info.height, forModel };
}
