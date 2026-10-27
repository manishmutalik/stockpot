import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import sharp from 'sharp';
import { readAiConfig } from '../aiConfig';
import type { AuthedRequest } from '../auth';
import { createPhotoroom, PHOTOROOM_EDIT_URL, PHOTOROOM_SEGMENT_URL, PhotoroomError, photoroomErrorMessage } from '../photoroom';
import { maskCoverage, maskToPng, placeOnPlain, placeOnScene, plainBackdropSvg, readMask } from '../promoteBackground';
import { createPromoteBackgroundHandler, parseBackgroundRequest, type PromoteBackgroundDeps } from '../promoteBackgroundRoutes';
import { BACKDROPS, backdropOf, PLAIN_BACKDROPS, SCENE_BACKDROPS } from '../../src/utils/promoteBackdrops';

const size = { width: 120, height: 90 };
/** A grey photo with an orange "dish" in the middle (x 40–80, y 30–60). */
const photo = () => sharp({ create: { ...size, channels: 3, background: '#808080' } })
  .composite([{ input: { create: { width: 40, height: 30, channels: 3, background: '#E07020' } }, left: 40, top: 30 }])
  .jpeg({ quality: 95 }).toBuffer();
/** Photoroom's cut-out: the dish kept, everything else transparent. */
const cutout = () => sharp({ create: { ...size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: { create: { width: 40, height: 30, channels: 4, background: { r: 224, g: 112, b: 32, alpha: 1 } } }, left: 40, top: 30 }])
  .png().toBuffer();
const pixel = async (jpeg: Buffer, x: number, y: number) => {
  const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
};
const near = (a: number[], b: number[], tolerance = 14) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance);

describe('the backgrounds on offer', () => {
  it('have unique ids, colours and prompts', () => {
    expect(new Set(BACKDROPS.map(b => b.id)).size).toBe(BACKDROPS.length);
    for (const b of PLAIN_BACKDROPS) expect(b.colour).toMatch(/^#[0-9A-F]{6}$/i);
    for (const s of SCENE_BACKDROPS) expect(s.prompt.length).toBeGreaterThan(20);
    expect(backdropOf('wood')?.kind).toBe('scene');
    expect(backdropOf('nope')).toBeNull();
  });
});

describe('the mask', () => {
  it('is the cut-out\'s transparency, at the photo\'s size, and survives being sent back as PNG', async () => {
    const mask = await readMask(await cutout(), size);
    expect(mask.length).toBe(size.width * size.height);
    expect(maskCoverage(mask)).toBeCloseTo((40 * 30) / (120 * 90), 2);
    const again = await readMask(await maskToPng(mask, size), size);
    expect(maskCoverage(again)).toBeCloseTo(maskCoverage(mask), 3);
  });

  it('is resized when the cut-out comes back smaller than the photo', async () => {
    const small = await sharp(await cutout()).resize(60, 45).png().toBuffer();
    expect((await readMask(small, size)).length).toBe(size.width * size.height);
  });
});

describe('placing the food', () => {
  it('on a plain backdrop: the food keeps its own pixels, the rest is the backdrop colour', async () => {
    const out = await placeOnPlain(await photo(), await readMask(await cutout(), size), size, '#D5E0CC');
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([120, 90, 'jpeg']);
    expect(near(await pixel(out, 60, 45), [224, 112, 32])).toBe(true);
    expect(near(await pixel(out, 5, 85), [213, 224, 204], 20)).toBe(true);
    expect(near(await pixel(out, 5, 85), [128, 128, 128])).toBe(false);
  });

  it('on an AI scene: the food keeps its own pixels, the rest is the scene', async () => {
    const scene = await sharp({ create: { width: 240, height: 180, channels: 3, background: '#2050A0' } }).jpeg().toBuffer();
    const out = await placeOnScene(await photo(), await readMask(await cutout(), size), size, scene);
    expect(near(await pixel(out, 60, 45), [224, 112, 32])).toBe(true);
    expect(near(await pixel(out, 5, 5), [32, 80, 160])).toBe(true);
  });

  it('draws a dark backdrop a little lighter in the middle', () => {
    const svg = plainBackdropSvg('#2F2C2A', size);
    expect(svg).toContain('stop-color="#2F2C2A"');
    expect(svg).not.toContain('stop-color="#2F2C2A"/><stop offset="1" stop-color="#2F2C2A"');
    expect(plainBackdropSvg('#F4F2EE', size)).toMatch(/<radialGradient/);
  });
});

describe('the Photoroom client', () => {
  const ok = (body = 'img') => ({ ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(body).buffer, text: async () => '' });

  it('cuts out with the key on the server, and asks for a scene the size of the photo with the subject in place', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok());
    const pr = createPhotoroom({ apiKey: () => ' sandbox_abc ', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect((await pr.cutout(Buffer.from('jpg'))).toString()).toBe('img');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(PHOTOROOM_SEGMENT_URL);
    expect(init.headers['x-api-key']).toBe('sandbox_abc');
    expect((init.body as FormData).get('image_file')).toBeInstanceOf(Blob);

    await pr.scene(Buffer.from('jpg'), 'On a wooden table');
    const [sceneUrl, sceneInit] = fetchImpl.mock.calls[1];
    const form = sceneInit.body as FormData;
    expect(sceneUrl).toBe(PHOTOROOM_EDIT_URL);
    expect(form.get('background.prompt')).toBe('On a wooden table');
    expect(form.get('outputSize')).toBe('originalImage');
    expect(form.get('referenceBox')).toBe('originalImage');
  });

  it('turns a refusal into an error with its status, and tells the owner only a plain message', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 402, text: async () => 'no credits left on key sk_live' });
    const pr = createPhotoroom({ apiKey: () => 'k', fetchImpl: fetchImpl as unknown as typeof fetch });
    const thrown = await pr.cutout(Buffer.from('x')).catch(e => e);
    expect(thrown).toBeInstanceOf(PhotoroomError);
    expect(thrown.status).toBe(402);
    expect(photoroomErrorMessage(thrown).message).not.toContain('sk_live');
    expect(photoroomErrorMessage(new PhotoroomError(500, 'x')).status).toBe(502);
    err.mockRestore();
  });

  it('does not call out without a key', async () => {
    const fetchImpl = vi.fn();
    await expect(createPhotoroom({ apiKey: () => undefined, fetchImpl: fetchImpl as unknown as typeof fetch }).cutout(Buffer.from('x'))).rejects.toBeInstanceOf(PhotoroomError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// ── The route ──────────────────────────────────────────────────────────────────

interface Answer { code: number; body: { result?: { image: string; width: number; height: number; mask?: string; scenesLeft?: number }; error?: string; code?: string } }
const res = () => {
  const r = { code: 200, body: {} } as Answer & { status: (c: number) => unknown; json: (b: Answer['body']) => unknown };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; };
  return r;
};
function deps(over: Partial<PromoteBackgroundDeps> & { env?: Record<string, string> } = {}) {
  const { env, ...rest } = over;
  return {
    config: () => readAiConfig({ AI_FEATURES_ENABLED: 'true', ANTHROPIC_API_KEY: 'sk-x', PHOTOROOM_API_KEY: 'sandbox_x', ...env }),
    billingDisabled: () => false,
    hasActiveAccess: vi.fn().mockResolvedValue(true),
    usageDay: vi.fn().mockResolvedValue('2026-10-27'),
    globalDay: () => '2026-10-27',
    reserve: vi.fn().mockResolvedValue({ ok: true, used: 1, limit: 20 }),
    reserveScene: vi.fn().mockResolvedValue({ ok: true, day: 1, month: 3 }),
    photoroom: {
      cutout: vi.fn(async () => cutout()),
      scene: vi.fn(async () => sharp({ create: { ...size, channels: 3, background: '#2050A0' } }).jpeg().toBuffer()),
    },
    ...rest,
  };
}
const owner = { uid: 'u1', email: 'owner@example.com', emailVerified: true };
const body = async (over: Record<string, unknown> = {}) => ({ image: { mediaType: 'image/jpeg', data: (await photo()).toString('base64') }, backdrop: 'sage', ...over });
const call = async (d: PromoteBackgroundDeps, b: unknown) => {
  const r = res();
  await createPromoteBackgroundHandler(d)({ ...owner, body: b } as unknown as AuthedRequest, r as unknown as Response);
  return r;
};

describe('POST /promote/background', () => {
  it('cuts the food out once, puts it on a plain backdrop, and sends the mask back for next time', async () => {
    const d = deps();
    const r = await call(d, await body());
    expect(r.code).toBe(200);
    expect(r.body.result).toMatchObject({ width: 120, height: 90 });
    expect(r.body.result?.mask).toBeTruthy();
    expect(d.photoroom.cutout).toHaveBeenCalledTimes(1);
    expect(d.reserve).toHaveBeenCalledWith(expect.objectContaining({ feature: 'cutout', perUserLimit: 20 }));
    expect(d.reserveScene).not.toHaveBeenCalled();
    expect(near(await pixel(Buffer.from(r.body.result!.image, 'base64'), 60, 45), [224, 112, 32])).toBe(true);
  });

  it('reuses a mask it is given: no cut-out, nothing counted', async () => {
    const mask = (await maskToPng(await readMask(await cutout(), size), size)).toString('base64');
    const d = deps();
    const r = await call(d, await body({ mask: { mediaType: 'image/png', data: mask }, backdrop: 'charcoal' }));
    expect(r.code).toBe(200);
    expect(r.body.result?.mask).toBeUndefined();
    expect(d.photoroom.cutout).not.toHaveBeenCalled();
    expect(d.reserve).not.toHaveBeenCalled();
  });

  it('makes an AI scene from its prompt, counted against the day and month, and says how many are left', async () => {
    const d = deps();
    const r = await call(d, await body({ backdrop: 'wood' }));
    expect(r.code).toBe(200);
    expect(d.photoroom.scene).toHaveBeenCalledWith(expect.any(Buffer), SCENE_BACKDROPS.find(b => b.id === 'wood')!.prompt);
    expect(d.reserveScene).toHaveBeenCalledWith(expect.objectContaining({ feature: 'scene', dailyLimit: 8, monthlyLimit: 8, globalWeight: 1 }));
    expect(r.body.result?.scenesLeft).toBe(5);
    expect(near(await pixel(Buffer.from(r.body.result!.image, 'base64'), 60, 45), [224, 112, 32])).toBe(true);
  });

  it('refuses a scene over the monthly allowance before spending a cut-out', async () => {
    const d = deps({ reserveScene: vi.fn().mockResolvedValue({ ok: false, reason: 'month_limit' }) });
    const r = await call(d, await body({ backdrop: 'festive' }));
    expect(r.code).toBe(429);
    expect(r.body.error).toMatch(/all 8 AI backgrounds for this month/);
    expect(d.photoroom.cutout).not.toHaveBeenCalled();
    expect(d.reserve).not.toHaveBeenCalled();
  });

  it('is unavailable without a Photoroom key, and for an account without AI', async () => {
    const none = deps({ env: { PHOTOROOM_API_KEY: '' } });
    expect((await call(none, await body())).body.code).toBe('backgrounds_unavailable');
    const unpaid = deps({ hasActiveAccess: vi.fn().mockResolvedValue(false) });
    expect((await call(unpaid, await body())).code).toBe(402);
    expect(unpaid.photoroom.cutout).not.toHaveBeenCalled();
  });

  it('refuses a request it does not understand', async () => {
    expect(parseBackgroundRequest({ image: { mediaType: 'image/jpeg', data: '/9j/' + 'A'.repeat(60) }, backdrop: 'paisley' })).toBeNull();
    expect(parseBackgroundRequest({ image: { mediaType: 'image/png', data: 'iVBORw0KGgo' + 'A'.repeat(60) }, backdrop: 'white' })).toBeNull();
    expect(parseBackgroundRequest({ image: { mediaType: 'image/jpeg', data: '/9j/' + 'A'.repeat(60) }, backdrop: 'white', mask: { mediaType: 'image/jpeg', data: '/9j/' + 'A'.repeat(60) } })).toBeNull();
    expect((await call(deps(), { backdrop: 'white' })).code).toBe(400);
  });

  it('says so when no food could be picked out', async () => {
    const empty = await sharp({ create: { ...size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const r = await call(deps({ photoroom: { cutout: vi.fn(async () => empty), scene: vi.fn() } }), await body());
    expect(r.code).toBe(422);
    expect(r.body.code).toBe('no_subject');
  });

  it('maps a Photoroom failure to a plain message', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await call(deps({ photoroom: { cutout: vi.fn().mockRejectedValue(new PhotoroomError(500, 'secret detail')), scene: vi.fn() } }), await body());
    expect(r.code).toBe(502);
    expect(JSON.stringify(r.body)).not.toContain('secret');
    err.mockRestore();
  });
});
