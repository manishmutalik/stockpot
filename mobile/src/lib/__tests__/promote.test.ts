import { describe, expect, it, vi } from 'vitest';
import { ApiError, type Api } from '../api';
import { loadPromoteAvailability, promoteAvailability, promotePhoto, promoteWorkingLabel, PROMOTE_PATH, PROMOTE_TIMEOUT_MS } from '../promote';
import type { PromoteResult } from '../../../../src/utils/promote';

const photo = { mediaType: 'image/jpeg' as const, data: '/9j/abc' };
const result: PromoteResult = {
  image: 'aW1n', width: 2048, height: 1536, remaining: 9, orderLine: null,
  reading: { isFood: true, menuItemId: null, dishName: 'Masala dosa', focus: { x: 0.5, y: 0.5 }, caption: 'Crisp and golden.', hashtags: ['#dosa', '#southindian', '#breakfast'] },
};
const poster = (post: Api['post']) => ({ post }) as Pick<Api, 'post'>;

describe('promoteAvailability', () => {
  it('reads what is left today', () => {
    expect(promoteAvailability({ available: true, limits: { promote: { remaining: 12 } } })).toEqual({ available: true, remaining: 12 });
    expect(promoteAvailability({ available: true, limits: { promote: {} } })).toEqual({ available: true, remaining: null });
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
