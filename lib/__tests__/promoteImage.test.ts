import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { adjustmentFor, improvePhoto } from '../promoteImage';
import { PROMOTE_MODEL_SIDE, PROMOTE_PHOTO_MAX_SIDE } from '../../src/utils/promote';

const photo = (width: number, height: number, background: { r: number; g: number; b: number }) =>
  sharp({ create: { width, height, channels: 3, background } }).jpeg().toBuffer();

/** Pixels: `share` of them `bright`, the rest `dark`. */
const pixels = (bright: number[], dark: number[], share = 0.1, count = 1000) =>
  Uint8Array.from(Array.from({ length: count }, (_, i) => (i < count * share ? bright : dark)).flat());

describe('adjustmentFor', () => {
  it('keeps a well-exposed neutral photo neutral and about as bright', () => {
    const a = adjustmentFor(pixels([240, 240, 240], [120, 120, 120], 0.3));
    expect(new Set(a.gains.map(g => g.toFixed(3))).size).toBe(1);
    expect(Math.abs(120 * a.gains[1] + a.offset - 120)).toBeLessThan(5);
  });

  it('takes most of a yellow cast out of the plate, but no more than 15% in a channel', () => {
    const { gains: [r, g, b] } = adjustmentFor(pixels([235, 220, 150], [130, 120, 90], 0.3));
    expect(b / r).toBeGreaterThan(1.2);
    expect(b / g).toBeLessThanOrEqual(1.15 / 0.85 + 1e-9);
  });

  it('balances on the brightest parts, not the food: a plate of orange curry on a white plate stays orange', () => {
    const { gains: [r, , b] } = adjustmentFor(pixels([238, 238, 236], [200, 90, 30], 0.2));
    expect(Math.abs(r - b)).toBeLessThan(0.02);
  });

  it('brightens a dark photo, without burning out its highlights', () => {
    const dark = Uint8Array.from([...pixels([4, 4, 4], [60, 60, 60], 0.02), ...pixels([170, 170, 170], [60, 60, 60], 0.05)]);
    const a = adjustmentFor(dark);
    const out = (v: number) => v * a.gains[1] + a.offset;
    expect(out(60)).toBeGreaterThan(80);
    expect(out(170)).toBeLessThanOrEqual(248);
  });

  it('copes with no pixels', () => {
    expect(adjustmentFor(new Uint8Array(0))).toEqual({ gains: [1, 1, 1], offset: 0 });
  });
});

describe('improvePhoto', () => {
  it('shrinks a large photo to the longest side, and makes the smaller copy for the model', async () => {
    const out = await improvePhoto(await photo(3000, 2000, { r: 200, g: 160, b: 90 }));
    expect(out.width).toBe(PROMOTE_PHOTO_MAX_SIDE);
    expect(out.height).toBe(Math.round(2000 * PROMOTE_PHOTO_MAX_SIDE / 3000));
    const model = await sharp(out.forModel).metadata();
    expect(Math.max(model.width!, model.height!)).toBe(PROMOTE_MODEL_SIDE);
    expect((await sharp(out.image).metadata()).format).toBe('jpeg');
  });

  it('does not enlarge a small photo', async () => {
    const out = await improvePhoto(await photo(800, 600, { r: 120, g: 120, b: 120 }));
    expect([out.width, out.height]).toEqual([800, 600]);
  });

  it('keeps no camera metadata', async () => {
    const tagged = await sharp(await photo(400, 300, { r: 150, g: 100, b: 60 })).withExif({ IFD0: { Make: 'TestCam' } }).jpeg().toBuffer();
    expect((await sharp(tagged).metadata()).exif).toBeDefined();
    const out = await improvePhoto(tagged);
    expect((await sharp(out.image).metadata()).exif).toBeUndefined();
  });
});
