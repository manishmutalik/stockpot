import { describe, it, expect } from 'vitest';
import { DRAFT_KEY, DRAFT_MAX_AGE_MS, createDraftStore, readPersistedDraft, type DraftStorage } from '../draftStore';

const KEY = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const NOW = 1_800_000_000_000;
const memory = (): DraftStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: async k => data.get(k) ?? null, setItem: async (k, v) => { data.set(k, v); }, removeItem: async k => { data.delete(k); } };
};
const draft = { text: '2 cakes for Priya', kind: 'order' as const, reading: { lineItems: [] }, answers: [{ questionId: 'payment', value: 'upi' }], idempotencyKey: KEY };

describe('the unsaved entry', () => {
  it('is kept and offered again, exactly as it was', async () => {
    const store = createDraftStore(memory(), () => NOW);
    await store.save(draft);
    expect(await store.load()).toEqual({ ...draft, savedAt: NOW });
  });

  it('is gone once cleared', async () => {
    const storage = memory();
    const store = createDraftStore(storage, () => NOW);
    await store.save(draft);
    await store.clear();
    expect(await store.load()).toBeNull();
    expect(storage.data.has(DRAFT_KEY)).toBe(false);
  });

  it('is not offered after three days', async () => {
    const storage = memory();
    await createDraftStore(storage, () => NOW).save(draft);
    expect(await createDraftStore(storage, () => NOW + DRAFT_MAX_AGE_MS - 1000).load()).not.toBeNull();
    expect(await createDraftStore(storage, () => NOW + DRAFT_MAX_AGE_MS + 1000).load()).toBeNull();
  });

  it('is not offered when it is not a draft', () => {
    const ok = JSON.stringify({ ...draft, savedAt: NOW });
    expect(readPersistedDraft(ok, NOW)).not.toBeNull();
    for (const bad of [null, '', 'nope', '[]', JSON.stringify({ ...draft, savedAt: NOW, text: '  ' }), JSON.stringify({ ...draft, savedAt: NOW, kind: 'sale' }),
      JSON.stringify({ ...draft, savedAt: NOW, idempotencyKey: 'short' }), JSON.stringify({ ...draft, savedAt: 'x' }), JSON.stringify({ ...draft, savedAt: NOW + 10 * 60_000 })]) {
      expect(readPersistedDraft(bad as string | null, NOW), String(bad)).toBeNull();
    }
  });

  it('drops answers and a reading that are malformed rather than refusing the whole draft', () => {
    const odd = readPersistedDraft(JSON.stringify({ ...draft, savedAt: NOW, reading: 'x', answers: [{ questionId: 'a', value: 'b' }, { questionId: 1 }, null] }), NOW);
    expect(odd).toEqual({ text: draft.text, kind: 'order', answers: [{ questionId: 'a', value: 'b' }], idempotencyKey: KEY, savedAt: NOW });
  });

  it('copes with storage that fails', async () => {
    const broken: DraftStorage = { getItem: async () => { throw new Error('x'); }, setItem: async () => { throw new Error('x'); }, removeItem: async () => { throw new Error('x'); } };
    const store = createDraftStore(broken, () => NOW);
    await expect(store.save(draft)).resolves.toBeUndefined();
    await expect(store.clear()).resolves.toBeUndefined();
    expect(await store.load()).toBeNull();
  });
});
