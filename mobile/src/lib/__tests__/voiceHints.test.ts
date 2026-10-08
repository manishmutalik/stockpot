import { describe, it, expect, vi } from 'vitest';
import { VOICE_HINTS_TTL_MS, clearVoiceHints, loadVoiceHints, newVoiceHintsCache, parseVoicePrefs } from '../voiceHints';

const apiOf = (phrases: unknown) => ({ get: vi.fn().mockResolvedValue({ phrases }) });

describe('parseVoicePrefs', () => {
  it('keeps customers\' names off unless it was stored as exactly on', () => {
    expect(parseVoicePrefs(null)).toEqual({ customerNames: false });
    expect(parseVoicePrefs('')).toEqual({ customerNames: false });
    expect(parseVoicePrefs('not json')).toEqual({ customerNames: false });
    expect(parseVoicePrefs('{"customerNames":"yes"}')).toEqual({ customerNames: false });
    expect(parseVoicePrefs('{"customerNames":true}')).toEqual({ customerNames: true });
  });
});

describe('loadVoiceHints', () => {
  it('asks the server, with customers only when they were switched on', async () => {
    const api = apiOf(['Pumpkin Seed Bread']);
    expect(await loadVoiceHints(api, { owner: 'u1', customerNames: false }, newVoiceHintsCache())).toEqual(['Pumpkin Seed Bread']);
    expect(api.get).toHaveBeenCalledWith('/api/mobile/speech-phrases');
    await loadVoiceHints(api, { owner: 'u1', customerNames: true }, newVoiceHintsCache());
    expect(api.get).toHaveBeenLastCalledWith('/api/mobile/speech-phrases?customers=1');
  });

  it('keeps what it fetched for a few minutes, per owner and per setting', async () => {
    const api = apiOf(['A']);
    const cache = newVoiceHintsCache();
    let t = 1_000;
    const now = () => t;
    await loadVoiceHints(api, { owner: 'u1', customerNames: false }, cache, now);
    t += VOICE_HINTS_TTL_MS - 1;
    await loadVoiceHints(api, { owner: 'u1', customerNames: false }, cache, now);
    expect(api.get).toHaveBeenCalledTimes(1);
    await loadVoiceHints(api, { owner: 'u2', customerNames: false }, cache, now); // another person: not shared
    await loadVoiceHints(api, { owner: 'u1', customerNames: true }, cache, now);   // another setting: not shared
    expect(api.get).toHaveBeenCalledTimes(3);
    t += 2;
    await loadVoiceHints(api, { owner: 'u1', customerNames: false }, cache, now);  // too old: asked again
    expect(api.get).toHaveBeenCalledTimes(4);
  });

  it('forgets everything when asked (sign-out)', async () => {
    const api = apiOf(['A']);
    const cache = newVoiceHintsCache();
    await loadVoiceHints(api, { owner: 'u1', customerNames: false }, cache);
    clearVoiceHints(cache);
    await loadVoiceHints(api, { owner: 'u1', customerNames: false }, cache);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('never throws: no hints when it cannot ask, the last ones when it has them, and junk is dropped', async () => {
    const failing = { get: vi.fn().mockRejectedValue(new Error('offline')) };
    expect(await loadVoiceHints(failing, { owner: 'u1', customerNames: false }, newVoiceHintsCache())).toEqual([]);
    const cache = newVoiceHintsCache();
    let t = 0;
    await loadVoiceHints(apiOf(['Kept']), { owner: 'u1', customerNames: false }, cache, () => t);
    t += VOICE_HINTS_TTL_MS + 1;
    expect(await loadVoiceHints(failing, { owner: 'u1', customerNames: false }, cache, () => t)).toEqual(['Kept']);
    expect(await loadVoiceHints(apiOf(['ok', 3, null, { a: 1 }]), { owner: 'u9', customerNames: false }, newVoiceHintsCache())).toEqual(['ok']);
    expect(await loadVoiceHints(apiOf('nope'), { owner: 'u9', customerNames: false }, newVoiceHintsCache())).toEqual([]);
  });
});
