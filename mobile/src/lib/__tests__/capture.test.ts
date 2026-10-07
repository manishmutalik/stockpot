import { describe, it, expect } from 'vitest';
import { COULD_NOT_READ, canSave, captureReducer, currentQuestion, initialCapture, parseBody, questionProgress, saveRequest, type CaptureAction, type CaptureState } from '../capture';
import type { ParseResponse } from '../../../../src/utils/quickApiTypes';

const KEY1 = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const KEY2 = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const run = (s: CaptureState, ...actions: CaptureAction[]) => actions.reduce(captureReducer, s);
const start = (over: Partial<CaptureState> = {}) => ({ ...initialCapture({ kind: null, idempotencyKey: KEY1 }), ...over });

const orderDraft = { common: { date: '2026-10-06', paymentStatus: 'paid' as const, paymentMethod: 'upi' as const }, lineItems: [{ menuItemId: 'cake', quantity: 2 }] };
const ready = (over: Record<string, any> = {}): ParseResponse => ({ kind: 'order', draft: orderDraft, questions: [], notes: [], preview: null, reading: { lineItems: [] }, currency: { code: 'INR', symbol: '₹' }, ...over }) as ParseResponse;
const asks = (n = 1): ParseResponse => ({
  kind: 'order', draft: orderDraft, notes: [], reading: { lineItems: [] },
  questions: Array.from({ length: n }, (_, i) => ({ id: `item:${i}`, type: 'choice' as const, prompt: `Which? ${i}`, options: [{ value: 'a', label: 'A' }] })),
}) as ParseResponse;

describe('writing it', () => {
  it('starts empty on the step to write, with the kind that was asked for', () => {
    const s = initialCapture({ kind: 'payment', idempotencyKey: KEY1 });
    expect(s).toMatchObject({ step: 'write', text: '', kind: 'payment', response: null, answers: [], error: null, saved: null });
  });

  it('forgets an earlier reading and its answers when the words change', () => {
    const s = run(start({ text: 'two cakes', reading: { x: 1 }, response: ready(), answers: [{ questionId: 'a', value: 'b' }], step: 'confirm' }), { type: 'textChanged', text: 'three cakes' });
    expect(s).toMatchObject({ step: 'write', text: 'three cakes', response: null, reading: undefined, answers: [] });
  });
});

describe('picking an unsaved entry up again', () => {
  it('goes back to the words with the reading and answers it had, and its own key', () => {
    const s = run(start(), { type: 'restored', text: '2 cakes', kind: 'order', reading: { r: 1 }, answers: [{ questionId: 'payment', value: 'upi' }], idempotencyKey: KEY2 });
    expect(s).toMatchObject({ step: 'write', text: '2 cakes', kind: 'order', reading: { r: 1 }, idempotencyKey: KEY2, response: null, error: null });
    expect(parseBody(s, { fresh: false })).toEqual({ text: '2 cakes', kind: 'order', reading: { r: 1 }, answers: [{ questionId: 'payment', value: 'upi' }] });
  });
});

describe('reading it', () => {
  it('goes to confirm when the draft is complete, with a new key and the reading kept', () => {
    const s = run(start({ text: '2 cakes' }), { type: 'readStarted', fresh: true }, { type: 'readFinished', response: ready(), idempotencyKey: KEY2 });
    expect(s).toMatchObject({ step: 'confirm', idempotencyKey: KEY2, reading: { lineItems: [] }, error: null });
  });

  it('goes to ask when something is open', () => {
    const s = run(start({ text: '2 cakes' }), { type: 'readStarted', fresh: true }, { type: 'readFinished', response: asks(2), idempotencyKey: KEY2 });
    expect(s.step).toBe('ask');
    expect(currentQuestion(s)?.id).toBe('item:0');
  });

  it('a fresh read throws away the earlier reading and answers', () => {
    const s = run(start({ reading: { old: true }, answers: [{ questionId: 'a', value: 'b' }], response: asks() }), { type: 'readStarted', fresh: true });
    expect(s).toMatchObject({ step: 'reading', reading: undefined, answers: [], response: null, returnTo: 'write' });
  });

  it('answering keeps them, and a failure then goes back to the question', () => {
    let s = start({ text: 'x', reading: { r: 1 }, response: asks(), step: 'ask' });
    s = run(s, { type: 'answered', questionId: 'item:0', value: 'a' }, { type: 'readStarted', fresh: false });
    expect(s).toMatchObject({ step: 'reading', reading: { r: 1 }, returnTo: 'ask' });
    expect(s.answers).toEqual([{ questionId: 'item:0', value: 'a' }]);
    expect(run(s, { type: 'readFailed', message: 'No connection.' })).toMatchObject({ step: 'ask', error: 'No connection.' });
  });

  it('a failed first read goes back to the words', () => {
    const s = run(start({ text: 'x' }), { type: 'readStarted', fresh: true }, { type: 'readFailed', message: 'No connection.' });
    expect(s).toMatchObject({ step: 'write', error: 'No connection.', text: 'x' });
  });

  it('says why when there is no draft and nothing to ask, and drops the reading so the next Read it is fresh', () => {
    const none = { kind: 'order', draft: null, questions: [], notes: [], code: 'unverified', error: 'I could not read that reliably.', reading: undefined } as ParseResponse;
    const s = run(start({ text: 'x', reading: { old: 1 } }), { type: 'readStarted', fresh: true }, { type: 'readFinished', response: none, idempotencyKey: KEY2 });
    expect(s).toMatchObject({ step: 'write', error: 'I could not read that reliably.', reading: undefined, response: null });
    const blank = run(start(), { type: 'readFinished', response: { ...none, error: undefined } as ParseResponse, idempotencyKey: KEY2 });
    expect(blank.error).toBe(COULD_NOT_READ);
  });

  it('takes the kind question like any other, then reads', () => {
    const kindAsk = { kind: null, draft: null, notes: [], questions: [{ id: 'kind', type: 'choice', prompt: 'What is this about?', options: [{ value: 'order', label: 'A customer order' }] }] } as ParseResponse;
    let s = run(start({ text: 'sourdough' }), { type: 'readStarted', fresh: true }, { type: 'readFinished', response: kindAsk, idempotencyKey: KEY2 });
    expect(s.step).toBe('ask');
    s = run(s, { type: 'answered', questionId: 'kind', value: 'order' });
    expect(parseBody(s, { fresh: false })).toEqual({ text: 'sourdough', answers: [{ questionId: 'kind', value: 'order' }] });
  });

  it('replaces an answer given twice to the same question', () => {
    const s = run(start(), { type: 'answered', questionId: 'date', value: '2026-10-08' }, { type: 'answered', questionId: 'date', value: '2026-10-09' });
    expect(s.answers).toEqual([{ questionId: 'date', value: '2026-10-09' }]);
  });
});

describe('the questions', () => {
  it('count those answered and those still open', () => {
    const s = start({ response: asks(2), answers: [] });
    expect(questionProgress(s)).toEqual({ number: 1, of: 2 });
    expect(questionProgress(start({ response: asks(1), answers: [{ questionId: 'a', value: 'b' }] }))).toEqual({ number: 2, of: 2 });
  });
});

describe('the body of a read', () => {
  const s = start({ text: '  2 cakes  ', kind: 'order', reading: { r: 1 }, answers: [{ questionId: 'a', value: 'b' }] });
  it('is just the words and the kind for a fresh read', () => {
    expect(parseBody(s, { fresh: true })).toEqual({ text: '2 cakes', kind: 'order' });
  });
  it('carries the reading and the answers when answering', () => {
    expect(parseBody(s, { fresh: false })).toEqual({ text: '2 cakes', kind: 'order', reading: { r: 1 }, answers: [{ questionId: 'a', value: 'b' }] });
  });
  it('leaves the kind out when the server is to work it out', () => {
    expect(parseBody(start({ text: 'x' }), { fresh: true })).toEqual({ text: 'x' });
  });
});

describe('saving', () => {
  it('goes through saving to saved, or back to confirm with the reason and the same key', () => {
    const base = start({ response: ready(), step: 'confirm', idempotencyKey: KEY2 });
    const failed = run(base, { type: 'saveStarted' }, { type: 'saveFailed', message: 'No connection. Your draft is kept.' });
    expect(failed).toMatchObject({ step: 'confirm', error: 'No connection. Your draft is kept.', idempotencyKey: KEY2 });
    const done = run(failed, { type: 'saveStarted' }, { type: 'saveFinished', summary: { kind: 'order', title: 'Order saved', lines: [] } });
    expect(done).toMatchObject({ step: 'saved', saved: { title: 'Order saved' }, error: null });
  });

  it('can be saved only when the draft is complete and not already saving', () => {
    expect(canSave(start({ response: ready(), step: 'confirm' }))).toBe(true);
    expect(canSave(start({ response: ready(), step: 'saving' }))).toBe(false);
    expect(canSave(start({ response: asks() }))).toBe(false);
    expect(canSave(start({ response: null }))).toBe(false);
    expect(canSave(start({ response: { kind: 'order', draft: null, questions: [], notes: [] } as ParseResponse }))).toBe(false);
  });

  it('needs "produce anyway" first when an ingredient would run short', () => {
    const short = { kind: 'production', draft: { rows: [{ recipeId: 'cake', quantityProduced: 20 }] }, questions: [], notes: [], preview: { date: '2026-10-06', rows: [], total: 0, label: { total: '₹0' }, shortages: [{ materialId: 'flour', name: 'Flour', unit: 'g', short: 3000 }] } } as ParseResponse;
    const s = start({ response: short, step: 'confirm' });
    expect(canSave(s)).toBe(false);
    expect(canSave(run(s, { type: 'acceptShortage' }))).toBe(true);
    // a new reading asks again
    expect(run(run(s, { type: 'acceptShortage' }), { type: 'readFinished', response: short, idempotencyKey: KEY1 }).shortageAccepted).toBe(false);
  });

  it('knows where each kind is saved, and refuses a payment that is not complete', () => {
    expect(saveRequest(ready())).toEqual({ path: '/api/mobile/orders', body: orderDraft });
    expect(saveRequest({ kind: 'restock', draft: { lines: [] }, questions: [], notes: [] } as ParseResponse)?.path).toBe('/api/mobile/restocks');
    expect(saveRequest({ kind: 'production', draft: { rows: [] }, questions: [], notes: [] } as ParseResponse)?.path).toBe('/api/mobile/production-runs');
    const pay = (draft: any) => ({ kind: 'payment', draft, questions: [], notes: [] }) as ParseResponse;
    expect(saveRequest(pay({ customerKey: 'phone:1', amount: 900, method: 'upi' }))).toEqual({ path: '/api/mobile/payments', body: { customerKey: 'phone:1', amount: 900, method: 'upi' } });
    expect(saveRequest(pay({ customerKey: 'phone:1', method: 'upi' }))).toBeNull();
    expect(saveRequest({ kind: 'order', draft: null, questions: [], notes: [] } as ParseResponse)).toBeNull();
    expect(saveRequest({ kind: null, draft: null, questions: [], notes: [] } as ParseResponse)).toBeNull();
  });
});
