/**
 * promoteBackground.ts
 *
 * Putting the food on a new background, with `sharp`. The food is always the photo's own pixels: the mask (where the
 * food is, from Photoroom's cut-out) makes everything else transparent, and that is laid over the new background at
 * the same size and place. Nothing about the food is redrawn, only what is around it.
 *  - A plain backdrop is a soft gradient of one colour (lighter in the middle, as under a light) with a soft shadow
 *    below the food, so it sits on the surface rather than floating.
 *  - An AI scene is Photoroom's painted background, the same size as the photo, which already has its own shadow.
 * The mask's edge is softened a little, so the food is not cut out with a hard line.
 */
import sharp from 'sharp';

export interface Size { width: number; height: number }

/** A mask (one channel, raw, white where the food is) from a cut-out with transparency, or a grey mask sent back by the app. */
export async function readMask(image: Buffer, size: Size): Promise<Buffer> {
  const meta = await sharp(image).metadata();
  const channel = (meta.hasAlpha ? Math.min(Math.max((meta.channels ?? 4) - 1, 0), 3) : 0) as 0 | 1 | 2 | 3;
  return sharp(image).extractChannel(channel).resize(size.width, size.height, { fit: 'fill' }).toColourspace('b-w').raw().toBuffer();
}

export const maskToPng = (mask: Buffer, size: Size) =>
  sharp(mask, { raw: { width: size.width, height: size.height, channels: 1 } }).png({ compressionLevel: 9 }).toBuffer();

/** How much of the photo the food covers, 0 to 1. */
export function maskCoverage(mask: Buffer): number {
  if (mask.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < mask.length; i++) sum += mask[i];
  return sum / (255 * mask.length);
}

const raw1 = (size: Size) => ({ raw: { width: size.width, height: size.height, channels: 1 as const } });

/** The photo with everything but the food transparent (the edge softened a little), as PNG. */
async function foodLayer(photo: Buffer, mask: Buffer, size: Size): Promise<Buffer> {
  // extractChannel(0): sharp hands a blurred one-channel image back as three channels otherwise.
  const soft = await sharp(mask, raw1(size)).blur(0.8).extractChannel(0).raw().toBuffer();
  // Two steps: sharp removes alpha late in a pipeline, which would also remove the mask joined in the same one.
  const rgb = await sharp(photo).resize(size.width, size.height, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  return sharp(rgb, { raw: { width: size.width, height: size.height, channels: 3 } }).joinChannel(soft, raw1(size)).png().toBuffer();
}

const hex = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const mix = (c: string, toward: number, amount: number) =>
  `#${hex(c).map(v => Math.round(v + (toward - v) * amount).toString(16).padStart(2, '0')).join('')}`;
const isDark = (c: string) => { const [r, g, b] = hex(c); return 0.299 * r + 0.587 * g + 0.114 * b < 96; };

/** A soft gradient of one colour, lighter a little above the middle. */
export function plainBackdropSvg(colour: string, size: Size): string {
  const light = mix(colour, 255, isDark(colour) ? 0.12 : 0.45);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}"><defs><radialGradient id="g" cx="50%" cy="42%" r="75%"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${colour}"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
}

/** A soft shadow from the mask, a little below the food. */
async function shadowLayer(mask: Buffer, size: Size, dark: boolean): Promise<Buffer> {
  const drop = Math.max(1, Math.round(size.height * 0.015));
  const alpha = await sharp(mask, raw1(size))
    .blur(Math.max(1, Math.max(size.width, size.height) / 60))
    .linear(dark ? 0.5 : 0.32, 0)
    .extend({ top: drop, background: '#000000' })
    .extract({ left: 0, top: 0, width: size.width, height: size.height })
    .extractChannel(0).raw().toBuffer();
  return sharp({ create: { width: size.width, height: size.height, channels: 3, background: '#000000' } })
    .joinChannel(alpha, raw1(size)).png().toBuffer();
}

const finish = (s: ReturnType<typeof sharp>) => s.jpeg({ quality: 88, mozjpeg: true }).toBuffer();

export async function placeOnPlain(photo: Buffer, mask: Buffer, size: Size, colour: string): Promise<Buffer> {
  const [food, shadow] = await Promise.all([foodLayer(photo, mask, size), shadowLayer(mask, size, isDark(colour))]);
  return finish(sharp(Buffer.from(plainBackdropSvg(colour, size))).resize(size.width, size.height).composite([{ input: shadow }, { input: food }]));
}

export async function placeOnScene(photo: Buffer, mask: Buffer, size: Size, scene: Buffer): Promise<Buffer> {
  const food = await foodLayer(photo, mask, size);
  return finish(sharp(scene).resize(size.width, size.height, { fit: 'cover' }).removeAlpha().composite([{ input: food }]));
}
