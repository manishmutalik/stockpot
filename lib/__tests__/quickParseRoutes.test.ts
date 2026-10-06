// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { createQuickParseHandler, readParseRequest, type QuickParseDeps } from '../quickParseRoutes';
import { readAiConfig } from '../aiConfig';
import { memoryQuickDb } from './memoryQuickDb';
import { customerDirectory } from '../../src/utils/quickParse';

const NOW = Date.parse('2026-10-06T04:30:00Z'); // 10:00 in India, Tuesday 6 October
const UID = 'u1';
const owner = { uid: UID, email: 'asha@example.com', emailVerified: true };

/** What the model returns: every field present, as the schema requires. */
const reading = (over: Record<string, any> = {}) => ({
  lineItems: [{ nameAsWritten: 'sourdough', menuItemId: 'sourdough', quantity: 2 }],
  customerLabel: null, customerName: null, when: null, deliveryAddress: null, paymentStatus: null, paymentMethod: null,
  discountAmount: null, discountPercent: null, notes: null, advanceAmount: null, ...over,
});

function world(opts: { menu?: boolean; model?: any; env?: Record<string, string> } = {}) {
  const mem = memoryQuickDb(() => NOW);
  mem.seed(UID, 'settings', 'bakery', { name: 'Anita', timezone: 'Asia/Kolkata' });
  mem.seed(UID, 'materials', 'flour', { name: 'Flour', unit: 'g', initialStock: 5000, costPerUnit: 0.05 });
  if (opts.menu !== false) {
    mem.seed(UID, 'menu', 'cake', { name: 'Chocolate Truffle Cake', sellingPrice: 900, finishedGoodsStock: 5, recipe: [{ materialId: 'flour', amount: 400, unit: 'g' }] });
    mem.seed(UID, 'menu', 'croissant', { name: 'Butter Croissant', sellingPrice: 120, finishedGoodsStock: 0, recipe: [{ materialId: 'flour', amount: 100, unit: 'g' }] });
    mem.seed(UID, 'menu', 'sourdough', { name: 'Sourdough', sellingPrice: 200, finishedGoodsStock: 3, recipe: [{ materialId: 'flour', amount: 50, unit: 'g' }] });
  }
  const orderModel = opts.model ?? vi.fn().mockResolvedValue({ raw: reading() });
  const deps = {
    db: mem.db, now: () => NOW, orderModel,
    config: () => readAiConfig({ AI_FEATURES_ENABLED: 'true', ANTHROPIC_API_KEY: 'sk-x', ...opts.env }),
    billingDisabled: () => false,
    hasActiveAccess: vi.fn().mockResolvedValue(true),
    usageDay: vi.fn().mockResolvedValue('2026-10-06'),
    globalDay: () => '2026-10-06',
    reserve: vi.fn().mockResolvedValue({ ok: true, used: 4, limit: 30 }),
  } as unknown as QuickParseDeps & { orderModel: any; reserve: any; hasActiveAccess: any };
  return { mem, deps };
}

const res = () => { const r: any = { code: 200, headers: {} }; r.status = (c: number) => { r.code = c; return r; }; r.json = (b: any) => { r.body = b; return r; }; r.setHeader = (k: string, v: string) => { r.headers[k] = v; }; return r; };
const call = async (deps: QuickParseDeps, body: unknown, user: Record<string, any> = owner) => {
  const r = res();
  await createQuickParseHandler(deps)({ ...user, body } as any, r);
  return r;
};
const say = (text: string, extra: Record<string, unknown> = {}) => ({ kind: 'order', text, ...extra });

describe('the request', () => {
  it('needs a message, a known kind and well-formed answers', () => {
    expect(readParseRequest({ text: 'hello' })).toMatchObject({ text: 'hello', kind: null, answers: [] });
    expect(readParseRequest({ text: '  ', kind: 'order' })).toBeNull();
    expect(readParseRequest({ text: 'x'.repeat(2001) })).toBeNull();
    expect(readParseRequest({ text: 'hi', kind: 'sale' })).toBeNull();
    expect(readParseRequest({ text: 'hi', answers: [{ questionId: 'date' }] })).toBeNull();
    expect(readParseRequest({ text: 'hi', answers: 'yes' })).toBeNull();
    expect(readParseRequest({ text: 'hi', reading: 'x' })).toBeNull();
    expect(readParseRequest('hi')).toBeNull();
  });
});

describe('a clear order', () => {
  it('becomes a draft the save endpoint takes, with the figures to confirm, and counts one parse use', async () => {
    const { deps } = world({ model: vi.fn().mockResolvedValue({ raw: reading({ customerName: 'Priya', paymentStatus: 'paid', paymentMethod: 'upi' }) }) });
    const r = await call(deps, say('Priya took 2 sourdough, paid by UPI'));
    expect(r.code).toBe(200);
    expect(r.body.kind).toBe('order');
    expect(r.body.questions).toEqual([]);
    expect(r.body.draft).toEqual({
      common: { date: '2026-10-06', customerName: 'Priya', paymentStatus: 'paid', paymentMethod: 'upi' },
      lineItems: [{ menuItemId: 'sourdough', quantity: 2 }],
    });
    expect(r.body.preview).toMatchObject({ total: 400, balanceDue: 0, advance: null });
    expect(r.body.preview.lines).toEqual([{ menuItemId: 'sourdough', name: 'Sourdough', quantity: 2, unitPrice: 200, lineTotal: 400, stockAfter: 1 }]);
    expect(r.body.preview.label.total).toBe('₹400.00');
    expect(r.body.reading).toMatchObject({ customerName: 'Priya' });
    expect(r.body.remaining).toBe(26);
    expect(deps.reserve).toHaveBeenCalledWith(expect.objectContaining({ uid: UID, feature: 'parse' }));
    expect(r.headers['Cache-Control']).toBe('private, no-store');
  });

  it('saves nothing', async () => {
    const { deps, mem } = world();
    await call(deps, say('2 sourdough'));
    expect(mem.stats.writes).toBe(0);
  });

  it('removes phone numbers and known customers\' names before the model sees the message, and fills them in from the record', async () => {
    const { deps, mem } = world();
    mem.seed(UID, 'orders', 'o1', { menuItemId: 'cake', quantity: 1, date: '2026-09-20', customerName: 'Meera Nair', customerPhone: '9876543210', unitPriceAtSale: 900 });
    const label = customerDirectory([{ id: 'o1', menuItemId: 'cake', quantity: 1, date: '2026-09-20', customerName: 'Meera Nair', customerPhone: '9876543210' } as any])[0].label;
    deps.orderModel.mockResolvedValue({ raw: reading({ customerLabel: label, paymentStatus: 'unpaid' }) });
    const r = await call(deps, say('Meera Nair, 98765 43210, wants 2 sourdough, will pay later'));
    const sent = deps.orderModel.mock.calls[0][0];
    expect(sent.text).not.toMatch(/Meera|9876|98765/);
    expect(sent.text).toContain(label);
    expect(r.body.draft.common).toMatchObject({ customerName: 'Meera Nair', customerPhone: '9876543210', paymentStatus: 'unpaid' });
  });
});

describe('what the message leaves open', () => {
  it('asks whether it was paid when it does not say', async () => {
    const { deps } = world();
    const r = await call(deps, say('2 sourdough'));
    expect(r.body.questions.map((q: any) => q.id)).toEqual(['payment']);
    expect(r.body.questions[0].options.map((o: any) => o.value)).toEqual(['upi', 'cash', 'card', 'other', 'later']);
    expect(r.body.draft.common.paymentStatus).toBeUndefined();
  });

  it('asks which menu item an unknown one is, offering the closest and leaving it out, never inventing a price', async () => {
    const { deps } = world();
    deps.orderModel.mockResolvedValue({ raw: reading({
      lineItems: [{ nameAsWritten: 'sourdough', menuItemId: 'sourdough', quantity: 2 }, { nameAsWritten: 'choclate cake', menuItemId: null, quantity: 1 }],
      paymentStatus: 'unpaid',
    }) });
    const r = await call(deps, say('2 sourdough and a choclate cake, pay later'));
    expect(r.body.questions).toHaveLength(1);
    expect(r.body.questions[0]).toMatchObject({ id: 'item:0', type: 'choice' });
    expect(r.body.questions[0].prompt).toContain('choclate cake');
    expect(r.body.questions[0].options).toEqual([{ value: 'cake', label: 'Chocolate Truffle Cake' }, { value: 'skip', label: 'Leave it out' }]);
    expect(r.body.draft.lineItems).toEqual([{ menuItemId: 'sourdough', quantity: 2 }]);
  });

  it('applies an answer without asking the model again or counting another use', async () => {
    const { deps } = world();
    const first = await call(deps, say('2 sourdough and a choclate cake, pay later'));
    deps.orderModel.mockClear(); deps.reserve.mockClear();
    // the model's reading from the first call comes back with the answers
    const withUnknown = reading({ lineItems: [{ nameAsWritten: 'sourdough', menuItemId: 'sourdough', quantity: 2 }, { nameAsWritten: 'choclate cake', menuItemId: null, quantity: 1 }], paymentStatus: 'unpaid' });
    const r = await call(deps, say('2 sourdough and a choclate cake, pay later', { reading: withUnknown, answers: [{ questionId: 'item:0', value: 'cake' }] }));
    expect(first.code).toBe(200);
    expect(r.body.questions).toEqual([]);
    expect(r.body.draft.lineItems).toEqual([{ menuItemId: 'sourdough', quantity: 2 }, { menuItemId: 'cake', quantity: 1 }]);
    expect(r.body.preview.total).toBe(1300);
    expect(deps.orderModel).not.toHaveBeenCalled();
    expect(deps.reserve).not.toHaveBeenCalled();
    expect(r.body.remaining).toBeUndefined();
  });

  it('leaves an item out when told to, and says so', async () => {
    const { deps } = world();
    const withUnknown = reading({ lineItems: [{ nameAsWritten: 'sourdough', menuItemId: 'sourdough', quantity: 2 }, { nameAsWritten: 'macarons', menuItemId: null, quantity: 6 }], paymentStatus: 'unpaid' });
    const r = await call(deps, say('2 sourdough and 6 macarons, pay later', { reading: withUnknown, answers: [{ questionId: 'item:0', value: 'skip' }] }));
    expect(r.body.questions).toEqual([]);
    expect(r.body.draft.lineItems).toEqual([{ menuItemId: 'sourdough', quantity: 2 }]);
    expect(r.body.notes).toEqual(['Left out 6 × macarons.']);
  });

  it('ignores an answer that is not a menu item', async () => {
    const { deps } = world();
    const withUnknown = reading({ lineItems: [{ nameAsWritten: 'macarons', menuItemId: null, quantity: 6 }], paymentStatus: 'unpaid' });
    const r = await call(deps, say('6 macarons, pay later', { reading: withUnknown, answers: [{ questionId: 'item:0', value: 'not-on-the-menu' }] }));
    expect(r.body.questions.map((q: any) => q.id)).toEqual(['item:0']);
  });

  it('asks the date when the words cannot be worked out, and takes a date back', async () => {
    const { deps } = world();
    const vague = reading({ when: 'whenever', paymentStatus: 'unpaid' });
    const asked = await call(deps, say('2 sourdough whenever, pay later', { reading: vague }));
    expect(asked.body.questions).toEqual([expect.objectContaining({ id: 'date', type: 'date' })]);
    const answered = await call(deps, say('2 sourdough whenever, pay later', { reading: vague, answers: [{ questionId: 'date', value: '2026-10-09' }] }));
    expect(answered.body.questions).toEqual([]);
    expect(answered.body.draft.common).toMatchObject({ date: '2026-10-09', preorder: true, paymentStatus: 'unpaid' });
    const nonsense = await call(deps, say('2 sourdough whenever, pay later', { reading: vague, answers: [{ questionId: 'date', value: 'soon' }] }));
    expect(nonsense.body.questions.map((q: any) => q.id)).toEqual(['date']);
  });

  it('books a later date as a pre-order that is pay-later unless it says otherwise', async () => {
    const { deps } = world();
    const r = await call(deps, say('2 sourdough for Saturday', { reading: reading({ when: 'Saturday' }) }));
    expect(r.body.questions).toEqual([]);
    expect(r.body.draft.common).toEqual({ date: '2026-10-10', preorder: true, paymentStatus: 'unpaid' });
    expect(r.body.preview.lines[0].stockAfter).toBeNull();
  });

  it('turns an advance into a pre-order, and asks how it was paid if the message does not say', async () => {
    const { deps } = world();
    const noMethod = reading({ when: 'Saturday', advanceAmount: 100 });
    const asked = await call(deps, say('2 sourdough for Saturday, 100 advance', { reading: noMethod }));
    expect(asked.body.questions.map((q: any) => q.id)).toEqual(['advance_method']);
    const answered = await call(deps, say('2 sourdough for Saturday, 100 advance', { reading: noMethod, answers: [{ questionId: 'advance_method', value: 'cash' }] }));
    expect(answered.body.questions).toEqual([]);
    expect(answered.body.draft.common.advance).toEqual({ amount: 100, method: 'cash' });
    expect(answered.body.preview).toMatchObject({ total: 400, advance: 100, balanceDue: 300 });
  });

  it('asks again with a smaller amount when the advance is more than the order', async () => {
    const { deps } = world();
    const big = reading({ when: 'Saturday', advanceAmount: 500, paymentMethod: 'upi' });
    const asked = await call(deps, say('2 sourdough for Saturday, 500 advance by UPI', { reading: big }));
    expect(asked.body.questions).toEqual([expect.objectContaining({ id: 'advance', type: 'amount' })]);
    const fixed = await call(deps, say('2 sourdough for Saturday, 500 advance by UPI', { reading: big, answers: [{ questionId: 'advance', value: '200' }] }));
    expect(fixed.body.questions).toEqual([]);
    expect(fixed.body.draft.common.advance).toEqual({ amount: 200, method: 'upi' });
  });

  it('offers a pre-order when there is not the stock, and books it when accepted', async () => {
    const { deps } = world();
    const short = reading({ lineItems: [{ nameAsWritten: 'croissant', menuItemId: 'croissant', quantity: 4 }], paymentStatus: 'unpaid' });
    const asked = await call(deps, say('4 croissant, pay later', { reading: short }));
    expect(asked.body.questions).toEqual([expect.objectContaining({ id: 'stock', options: [{ value: 'preorder', label: 'Book it as a pre-order' }] })]);
    expect(asked.body.questions[0].prompt).toMatch(/Only 0 unit/);
    const accepted = await call(deps, say('4 croissant, pay later', { reading: short, answers: [{ questionId: 'stock', value: 'preorder' }] }));
    expect(accepted.body.questions).toEqual([]);
    expect(accepted.body.draft.common).toMatchObject({ preorder: true, date: '2026-10-06' });
  });

  it('says so when nothing on the menu was found and there is nothing to ask', async () => {
    const { deps } = world();
    const r = await call(deps, say('nothing here', { reading: reading({ lineItems: [] }) }));
    expect(r.body).toMatchObject({ draft: null, code: 'no_items' });
  });
});

describe('deciding what the message is about', () => {
  it('works it out from the words when the app does not say, and asks when it cannot', async () => {
    const { deps } = world();
    const clear = await call(deps, { text: '2 sourdough ordered by Priya for tomorrow' });
    expect(clear.body.kind).toBe('order');
    const vague = await call(deps, { text: 'sourdough' });
    expect(vague.body).toMatchObject({ kind: null, draft: null });
    expect(vague.body.questions[0]).toMatchObject({ id: 'kind', type: 'choice' });
    expect(vague.body.questions[0].options.map((o: any) => o.value)).toEqual(['order', 'restock', 'production', 'payment']);
    expect(deps.orderModel).toHaveBeenCalledTimes(1); // asking what it is about costs nothing
  });

  it('takes the answer to that question', async () => {
    const { deps } = world();
    const r = await call(deps, { text: '2 sourdough', answers: [{ questionId: 'kind', value: 'order' }] });
    expect(r.body.kind).toBe('order');
  });

  it('does not yet read the other kinds', async () => {
    const { deps } = world();
    const r = await call(deps, { kind: 'restock', text: 'bought 5 kg butter for 2000' });
    expect(r.code).toBe(501);
    expect(r.body.code).toBe('kind_not_ready');
  });
});

describe('who may use it and what can go wrong', () => {
  it('refuses a bad request, an account without AI, and the demo kitchen', async () => {
    const { deps } = world();
    expect((await call(deps, { nope: true })).code).toBe(400);
    const demo = await call(deps, say('2 sourdough'), { ...owner, email: 'demo_1_2@bettereat.com' });
    expect(demo.code).toBe(403);
    expect(demo.body.code).toBe('demo_account');
    const off = world({ env: { AI_FEATURES_ENABLED: 'false' } });
    expect((await call(off.deps, say('2 sourdough'))).code).toBe(503);
  });

  it('needs an active plan, as the web readers do', async () => {
    const { deps } = world();
    deps.hasActiveAccess.mockResolvedValue(false);
    const r = await call(deps, say('2 sourdough'));
    expect(r.code).toBe(402);
    expect(deps.orderModel).not.toHaveBeenCalled();
  });

  it('stops at the daily limit without calling the model', async () => {
    const { deps } = world();
    deps.reserve.mockResolvedValue({ ok: false, reason: 'user_limit' });
    const r = await call(deps, say('2 sourdough'));
    expect(r.code).toBe(429);
    expect(deps.orderModel).not.toHaveBeenCalled();
  });

  it('gives up honestly when the model\'s reading does not hold up against the message', async () => {
    const wrong = reading({ lineItems: [{ nameAsWritten: 'sourdough', menuItemId: 'sourdough', quantity: 9 }] });
    const { deps } = world({ model: vi.fn().mockResolvedValue({ raw: wrong }) });
    const r = await call(deps, say('2 sourdough'));
    expect(r.code).toBe(200);
    expect(r.body).toMatchObject({ draft: null, code: 'unverified', remaining: 26 });
    expect(deps.orderModel).toHaveBeenCalledTimes(2);
  });

  it('refuses a reading sent back that is not what the message says', async () => {
    const { deps } = world();
    const r = await call(deps, say('2 sourdough', { reading: reading({ lineItems: [{ nameAsWritten: 'sourdough', menuItemId: 'sourdough', quantity: 9 }] }) }));
    expect(r.code).toBe(400);
    expect(r.body.code).toBe('bad_reading');
  });

  it('asks for a menu first when there is none', async () => {
    const { deps } = world({ menu: false });
    const r = await call(deps, say('2 sourdough'));
    expect(r.code).toBe(422);
    expect(r.body.code).toBe('no_menu');
  });

  it('reads only the signed-in owner\'s own menu and customers', async () => {
    const { deps, mem } = world();
    mem.seed('someone-else', 'menu', 'secret', { name: 'Secret Cake', sellingPrice: 1, finishedGoodsStock: 1 });
    await call(deps, say('2 sourdough'));
    expect(JSON.stringify(deps.orderModel.mock.calls[0][0].menu)).not.toContain('Secret');
  });

  it('answers 500 when the model call throws', async () => {
    const { deps } = world({ model: vi.fn().mockRejectedValue(new Error('boom')) });
    const r = await call(deps, say('2 sourdough'));
    expect(r.code).toBeGreaterThanOrEqual(500);
  });
});
