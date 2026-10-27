import { describe, expect, it, vi } from 'vitest';
import { ApiError, type Api } from '../api';
import { loadPromoteAvailability, promoteAvailability, promotePhoto, promoteWorkingLabel, PROMOTE_PATH, PROMOTE_STYLE_PATH, PROMOTE_TIMEOUT_MS, stylePhoto } from '../promote';
import type { PromoteResult } from '../../../../src/utils/promote';

const photo = { mediaType: 'image/jpeg' as const, data: '/9j/abc' };
const result: PromoteResult = {
  image: 'aW1n', width: 2048, height: 1536, remaining: 9, orderLine: null,
  reading: { isFood: true, menuItemId: null, dishName: 'Masala dosa', focus: { x: 0.5, y: 0.5 }, caption: 'Crisp and golden.', hashtags: ['#dosa', '#southindian', '#breakfast'] },
};
const poster = (post: Api['post']) => ({ post }) as Pick<Api, 'post'>;

describe('promoteAvailability', () => {
  it('reads what is left today', () => {
    expect(promoteAvailability({ available: true, limits: { promote: { remaining: 12 } } })).toEqual({ available: true, remaining: 12, styling: null });
    expect(promoteAvailability({ available: true, limits: { promote: {} } })).toEqual({ available: true, remaining: null, styling: null });
    expect(promoteAvailability({ available: true, limits: { promote: { remaining: 12 }, style: { remaining: 5 } } }))
      .toEqual({ available: true, remaining: 12, styling: { left: 5 } });
  });

  it('says why it is not available', () => {
    expect(promoteAvailability({ available: false, reason: 'demo_account' })).toMatchObject({ message: expect.stringMatching(/demo kitchen/) });
    expect(promoteAvailability({ available: false, reason: 'subscription_required' })).toMatchObject({ message: expect.stringMatching(/plan/) });
    expect(promoteAvailability({ available: false, reason: 'not_allowed' })).toMatchObject({ message: expect.stringMatching(/not switched on/) });
    // An older server that has no Promote yet
    expect(promoteAvailability({ available: true, limits: { recipe: { remaining: 3 } } })).toMatchObject({ available: false });
  });

  it('turns a failure to ask into a message', async () => {
    const api = { get: vi.fn().mockRejectedValue(new ApiError(0, 'offline', 'No connection.')) } as unknown as Pick<Api, 'get'>;
    expect(await loadPromoteAvailability(api)).toEqual({ available: false, message: expect.stringMatching(/No connection/) });
  });
});

describe('promotePhoto', () => {
  it('sends the photo and the language, with a longer wait, and returns the result', async () => {
    const post = vi.fn().mockResolvedValue({ result });
    expect(await promotePhoto(poster(post), photo, 'hinglish')).toEqual({ ok: true, result, remaining: 9 });
    expect(post).toHaveBeenCalledWith(PROMOTE_PATH, { photo, language: 'hinglish' }, { timeoutMs: PROMOTE_TIMEOUT_MS });
  });

  it('turns every failure into something to show', async () => {
    const answer = (v: unknown) => promotePhoto(poster(vi.fn().mockResolvedValue(v)), photo, 'en');
    const fail = (e: unknown) => promotePhoto(poster(vi.fn().mockRejectedValue(e)), photo, 'en');
    expect(await answer({ result: null, code: 'unverified', error: 'I could not write a post.', remaining: 4 })).toEqual({ ok: false, message: 'I could not write a post.', remaining: 4 });
    expect(await fail(new ApiError(429, 'daily_limit', 'You have used all of today’s AI requests.'))).toEqual({ ok: false, message: 'You have used all of today’s AI requests.', remaining: 0 });
    expect(await fail(new ApiError(0, 'timeout', 'No connection.'))).toMatchObject({ message: expect.stringMatching(/took too long/) });
    expect(await fail(new ApiError(413, 'error', 'x'))).toMatchObject({ message: expect.stringMatching(/too large/) });
    expect(await fail(new ApiError(0, 'offline', 'No connection.'))).toMatchObject({ message: expect.stringMatching(/No connection/) });
  });
});

describe('promoteWorkingLabel', () => {
  it('says what is happening as time passes', () => {
    expect(promoteWorkingLabel(0)).toMatch(/Sending/);
    expect(promoteWorkingLabel(10_000)).toMatch(/look its best/);
    expect(promoteWorkingLabel(30_000)).toMatch(/caption/);
  });
});

describe('stylePhoto', () => {
  it('sends the photo, the style and the shape, with a longer wait', async () => {
    const post = vi.fn().mockResolvedValue({ result: { image: 'b', width: 768, height: 1024, stylesLeft: 4 } });
    expect(await stylePhoto(poster(post), 'img', 'rustic', 'story')).toMatchObject({ ok: true, result: { stylesLeft: 4 } });
    expect(post).toHaveBeenCalledWith(PROMOTE_STYLE_PATH, { image: { mediaType: 'image/jpeg', data: 'img' }, style: 'rustic', shape: 'story' }, { timeoutMs: PROMOTE_TIMEOUT_MS });
  });

  it('passes on what the server said, and how many are left', async () => {
    const fail = (e: unknown) => stylePhoto(poster(vi.fn().mockRejectedValue(e)), 'img', 'cafe', 'post');
    expect(await fail(new ApiError(429, 'monthly_limit', 'You have styled all 8 photos for this month.'))).toEqual({ ok: false, message: 'You have styled all 8 photos for this month.', left: 0 });
    expect(await fail(new ApiError(422, 'style_declined', 'This photo could not be styled.', { stylesLeft: 3 }))).toEqual({ ok: false, message: 'This photo could not be styled.', left: 3 });
    expect(await fail(new ApiError(503, 'style_busy', 'Styling is very busy right now.'))).toMatchObject({ message: /very busy/ });
    expect(await fail(new ApiError(0, 'timeout', 'No connection.'))).toMatchObject({ message: /took too long/ });
  });
});
