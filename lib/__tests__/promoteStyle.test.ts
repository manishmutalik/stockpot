import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import sharp from 'sharp';
import { readAiConfig } from '../aiConfig';
import type { AuthedRequest } from '../auth';
import { createGeminiImage, GEMINI_API_BASE, GeminiImageError, geminiErrorMessage } from '../geminiImage';
import { buildStylePrompt } from '../promoteStylePrompt';
import { createPromoteStyleHandler, parseStyleRequest, STYLE_GLOBAL_WEIGHT, STYLE_INPUT_SIDE, type PromoteStyleDeps } from '../promoteStyleRoutes';
import { PROMOTE_STYLES, STYLE_ASPECT, styleOf } from '../../src/utils/promoteStyles';

const jpeg = (width: number, height: number, background = '#B8521C') => sharp({ create: { width, height, channels: 3, background } }).jpeg().toBuffer();
const png = (width: number, height: number) => sharp({ create: { width, height, channels: 4, background: { r: 40, g: 90, b: 160, alpha: 1 } } }).png().toBuffer();

describe('the styles', () => {
  it('have unique ids, and a post is asked for at 3:4', () => {
    expect(new Set(PROMOTE_STYLES.map(s => s.id)).size).toBe(PROMOTE_STYLES.length);
    expect(styleOf('rustic')?.label).toBe('Rustic table');
    expect(styleOf('nope')).toBeNull();
    expect(STYLE_ASPECT).toEqual({ post: '3:4', square: '1:1', story: '9:16' });
  });

  it('tell the model the owner\'s rule: touch the food up, change nothing physical, add nothing', () => {
    const prompt = buildStylePrompt(styleOf('rustic')!);
    expect(prompt).toContain('weathered wooden table');
    expect(prompt).toMatch(/Keep the food exactly as it is physically/);
    expect(prompt).toMatch(/Do not add anything to the food: no garnish/);
    expect(prompt).toMatch(/same plate or bowl/);
    expect(prompt).toMatch(/No text, logos/);
  });
});

describe('the Gemini client', () => {
  const answer = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) });
  const imageBody = (data = Buffer.from('img').toString('base64')) => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ inlineData: { mimeType: 'image/png', data } }] } }] });

  it('sends the photo and the instructions to the chosen model, asking for an image at the aspect ratio', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(answer(imageBody()));
    const gemini = createGeminiImage({ apiKey: () => ' g-key ', model: () => 'gemini-3.1-flash-image', fetchImpl: fetchImpl as unknown as typeof fetch });
    const out = await gemini.edit({ photo: Buffer.from('photo'), prompt: 'Style it', aspectRatio: '3:4' });
    expect(out).toEqual({ data: Buffer.from('img'), mimeType: 'image/png' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${GEMINI_API_BASE}/gemini-3.1-flash-image:generateContent`);
    expect(init.headers['x-goog-api-key']).toBe('g-key');
    const sent = JSON.parse(init.body);
    expect(sent.contents[0].parts).toEqual([{ inlineData: { mimeType: 'image/jpeg', data: Buffer.from('photo').toString('base64') } }, { text: 'Style it' }]);
    expect(sent.generationConfig).toEqual({ responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '3:4' } });
  });

  it('tells a declined photo from a failure, and never shows Gemini\'s own text', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const call = (body: unknown, ok = true, status = 200) =>
      createGeminiImage({ apiKey: () => 'k', model: () => 'm', fetchImpl: vi.fn().mockResolvedValue(answer(body, ok, status)) as unknown as typeof fetch })
        .edit({ photo: Buffer.from('x'), prompt: 'p', aspectRatio: '1:1' }).catch((e: unknown) => e);
    const declined = await call({ candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [] } }] });
    expect(declined).toBeInstanceOf(GeminiImageError);
    expect(geminiErrorMessage(declined).code).toBe('style_declined');
    expect(geminiErrorMessage(await call({ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } })).code).toBe('style_declined');
    expect(geminiErrorMessage(await call({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Here you go' }] } }] })).code).toBe('style_failed');
    const busy = await call({ error: { message: 'quota for key AIza123' } }, false, 429);
    expect(geminiErrorMessage(busy)).toMatchObject({ status: 503, code: 'style_busy' });
    expect(geminiErrorMessage(busy).message).not.toContain('AIza');
    err.mockRestore();
  });

  it('does not call out without a key', async () => {
    const fetchImpl = vi.fn();
    const gemini = createGeminiImage({ apiKey: () => undefined, model: () => 'm', fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(gemini.edit({ photo: Buffer.from('x'), prompt: 'p', aspectRatio: '1:1' })).rejects.toBeInstanceOf(GeminiImageError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// ── The route ──────────────────────────────────────────────────────────────────

interface Answer { code: number; body: { result?: { image: string; width: number; height: number; stylesLeft: number }; error?: string; code?: string; stylesLeft?: number } }
const res = () => {
  const r = { code: 200, body: {} } as Answer & { status: (c: number) => unknown; json: (b: Answer['body']) => unknown };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; };
  return r;
};
function deps(over: Partial<PromoteStyleDeps> & { env?: Record<string, string> } = {}) {
  const { env, ...rest } = over;
  return {
    config: () => readAiConfig({ AI_FEATURES_ENABLED: 'true', ANTHROPIC_API_KEY: 'sk-x', GEMINI_API_KEY: 'g-key', ...env }),
    billingDisabled: () => false,
    hasActiveAccess: vi.fn().mockResolvedValue(true),
    usageDay: vi.fn().mockResolvedValue('2026-10-27'),
    globalDay: () => '2026-10-27',
    reserveStyle: vi.fn().mockResolvedValue({ ok: true, day: 1, month: 3 }),
    gemini: { edit: vi.fn(async () => ({ data: await png(768, 1024), mimeType: 'image/png' })) },
    ...rest,
  };
}
const owner = { uid: 'u1', email: 'owner@example.com', emailVerified: true };
const body = async (over: Record<string, unknown> = {}) => ({ image: { mediaType: 'image/jpeg', data: (await jpeg(2048, 1536)).toString('base64') }, style: 'rustic', ...over });
const call = async (d: PromoteStyleDeps, b: unknown) => {
  const r = res();
  await createPromoteStyleHandler(d)({ ...owner, body: b } as unknown as AuthedRequest, r as unknown as Response);
  return r;
};

describe('POST /promote/style', () => {
  it('sends a smaller copy with the style\'s instructions at the shape\'s ratio, and returns a JPEG with what is left', async () => {
    const d = deps();
    const r = await call(d, await body({ shape: 'story' }));
    expect(r.code).toBe(200);
    expect(r.body.result).toMatchObject({ width: 768, height: 1024, stylesLeft: 5 });
    expect((await sharp(Buffer.from(r.body.result!.image, 'base64')).metadata()).format).toBe('jpeg');
    const sent = vi.mocked(d.gemini.edit).mock.calls[0][0];
    expect(sent.aspectRatio).toBe('9:16');
    expect(sent.prompt).toBe(buildStylePrompt(styleOf('rustic')!));
    const meta = await sharp(sent.photo).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(STYLE_INPUT_SIDE);
    expect(d.reserveStyle).toHaveBeenCalledWith(expect.objectContaining({ feature: 'style', dailyLimit: 8, monthlyLimit: 8, globalWeight: STYLE_GLOBAL_WEIGHT }));
  });

  it('makes a post unless told otherwise', async () => {
    const d = deps();
    await call(d, await body());
    expect(vi.mocked(d.gemini.edit).mock.calls[0][0].aspectRatio).toBe('3:4');
  });

  it('refuses over the monthly allowance without calling Gemini', async () => {
    const d = deps({ reserveStyle: vi.fn().mockResolvedValue({ ok: false, reason: 'month_limit' }) });
    const r = await call(d, await body());
    expect(r.code).toBe(429);
    expect(r.body.error).toMatch(/all 8 photos for this month/);
    expect(d.gemini.edit).not.toHaveBeenCalled();
  });

  it('is unavailable without a Gemini key, and for an account without AI', async () => {
    expect((await call(deps({ env: { GEMINI_API_KEY: '' } }), await body())).body.code).toBe('style_unavailable');
    const unpaid = deps({ hasActiveAccess: vi.fn().mockResolvedValue(false) });
    expect((await call(unpaid, await body())).code).toBe(402);
    expect(unpaid.reserveStyle).not.toHaveBeenCalled();
  });

  it('refuses a request it does not understand', async () => {
    const ok = { mediaType: 'image/jpeg', data: '/9j/' + 'A'.repeat(60) };
    expect(parseStyleRequest({ image: ok, style: 'paisley' })).toBeNull();
    expect(parseStyleRequest({ image: ok, style: 'rustic', shape: 'banner' })).toBeNull();
    expect(parseStyleRequest({ image: { mediaType: 'image/png', data: 'iVBORw0KGgo' + 'A'.repeat(60) }, style: 'rustic' })).toBeNull();
    expect((await call(deps(), { style: 'rustic' })).code).toBe(400);
  });

  it('says plainly when Gemini declines or fails, with what is left', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const declined = await call(deps({ gemini: { edit: vi.fn().mockRejectedValue(new GeminiImageError(200, 'declined', 'IMAGE_SAFETY')) } }), await body());
    expect(declined.code).toBe(422);
    expect(declined.body).toMatchObject({ code: 'style_declined', stylesLeft: 5 });
    const failed = await call(deps({ gemini: { edit: vi.fn().mockRejectedValue(new GeminiImageError(500, 'failed', 'secret detail')) } }), await body());
    expect(failed.code).toBe(502);
    expect(JSON.stringify(failed.body)).not.toContain('secret');
    err.mockRestore();
  });
});
