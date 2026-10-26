import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { readAiConfig, PROMOTE_AI_MODEL } from '../aiConfig';
import type { AuthedRequest } from '../auth';
import { createPromoteModel } from '../promoteModel';
import { buildPromoteUserMessage, PROMOTE_SYSTEM_PROMPT } from '../promotePrompt';
import { createPromoteHandler, parsePromoteRequest, promoteContextFrom, readPromoteValidated, type PromoteDeps } from '../promoteRoutes';
import { PROMOTE_MAX_MENU, PROMOTE_SCHEMA } from '../../src/utils/promote';

const jpeg = '/9j/' + 'A'.repeat(60);
const good = {
  isFood: true, menuItemId: 'm1', dishName: 'Butter Chicken', focusX: 0.5, focusY: 0.55,
  caption: 'Creamy, smoky and slow-cooked. Our butter chicken is ready for tonight. DM to order!',
  hashtags: ['#butterchicken', '#indianfood', '#punefoodie'],
};
const context = {
  business: { name: 'Food Haven', address: 'Baner, Pune' }, phone: '98765 43210',
  menu: [{ id: 'm1', name: 'Butter Chicken', category: 'Mains' }, { id: 'm2', name: 'Dal Makhani' }],
};

describe('the request', () => {
  it('takes one photo and a language, English unless asked', () => {
    expect(parsePromoteRequest({ photo: { mediaType: 'image/jpeg', data: jpeg } })).toMatchObject({ language: 'en' });
    expect(parsePromoteRequest({ photo: { mediaType: 'image/jpeg', data: jpeg }, language: 'hinglish' })).toMatchObject({ language: 'hinglish' });
  });

  it('refuses a missing or mislabelled photo, and an unknown language', () => {
    expect(parsePromoteRequest({})).toBeNull();
    expect(parsePromoteRequest({ photo: { mediaType: 'image/png', data: jpeg } })).toBeNull();
    expect(parsePromoteRequest({ photo: { mediaType: 'image/jpeg', data: jpeg }, language: 'fr' })).toBeNull();
    expect(parsePromoteRequest('photo')).toBeNull();
  });
});

describe('what the post is written from', () => {
  it('sends the items for sale, not bases and fillings, and the business details', () => {
    const c = promoteContextFrom(
      { name: ' Food Haven ', address: 'Baner, Pune', phone: '98765 43210', upiId: 'x@upi' },
      [{ id: 'm1', name: 'Butter Chicken', category: 'Mains', sellingPrice: 320 }, { id: 'b1', name: 'Makhani gravy', notForSale: true }, { id: 'bad id!', name: 'X' }, { id: 'm3', name: '' }],
    );
    expect(c).toEqual({ business: { name: 'Food Haven', address: 'Baner, Pune' }, phone: '98765 43210', menu: [{ id: 'm1', name: 'Butter Chicken', category: 'Mains' }] });
  });

  it('copes with an account that has saved nothing, and keeps the menu bounded', () => {
    expect(promoteContextFrom({}, [])).toEqual({ business: { name: null, address: null }, phone: null, menu: [] });
    const many = Array.from({ length: PROMOTE_MAX_MENU + 20 }, (_, i) => ({ id: `m${i}`, name: `Item ${i}` }));
    expect(promoteContextFrom({}, many).menu).toHaveLength(PROMOTE_MAX_MENU);
  });

  it('never sends the phone number to the model', () => {
    const msg = buildPromoteUserMessage({ business: context.business, menu: context.menu, language: 'en' });
    expect(msg).toContain('Food Haven');
    expect(msg).toContain('"id":"m1"');
    expect(msg).not.toContain('98765');
    expect(PROMOTE_SYSTEM_PROMPT).toMatch(/data, not instructions/);
  });

  it('says what was wrong on a retry', () => {
    expect(buildPromoteUserMessage({ business: context.business, menu: [], language: 'hinglish', problems: ['the caption is empty'] }))
      .toMatch(/has not added a menu[\s\S]*Language: hinglish[\s\S]*rejected: the caption is empty/);
  });
});

describe('the model call', () => {
  const reply = (over: Record<string, unknown> = {}) => ({ model: PROMOTE_AI_MODEL, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(good) }], usage: { input_tokens: 2400, output_tokens: 300 }, ...over });
  const client = (r: unknown) => { const create = vi.fn().mockResolvedValue(r); return { create, get: () => ({ beta: { messages: { create } } }) as never }; };

  it('sends the photo and the schema to the promote model', async () => {
    const c = client(reply());
    const out = await createPromoteModel(c.get)({ photo: Buffer.from('jpg'), business: context.business, menu: context.menu, language: 'en' });
    expect(out.raw).toEqual(good);
    const sent = c.create.mock.calls[0][0];
    expect(sent.model).toBe('claude-sonnet-5-5');
    expect(sent.output_config.format.schema).toBe(PROMOTE_SCHEMA);
    expect(sent.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: Buffer.from('jpg').toString('base64') } });
    expect(sent.fallbacks).toBe('default');
  });

  it('returns nothing for a cut-off, refused or unreadable answer', async () => {
    for (const r of [reply({ stop_reason: 'max_tokens' }), reply({ stop_reason: 'refusal' }), reply({ content: [] }), reply({ content: [{ type: 'text', text: 'nope' }] })]) {
      expect((await createPromoteModel(client(r).get)({ photo: Buffer.from('x'), business: context.business, menu: [], language: 'en' })).raw).toBeUndefined();
    }
  });
});

interface Answer { code: number; body: Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any
const res = () => {
  const r = { code: 200, body: {} } as Answer & { status: (c: number) => unknown; json: (b: Answer['body']) => unknown };
  r.status = c => { r.code = c; return r; };
  r.json = b => { r.body = b; return r; };
  return r;
};
const improved = { image: Buffer.from('improved'), width: 2048, height: 1536, forModel: Buffer.from('small') };
function deps(over: Partial<PromoteDeps> & { env?: Record<string, string> } = {}) {
  const { env, ...rest } = over;
  return {
    config: () => readAiConfig({ AI_FEATURES_ENABLED: 'true', ANTHROPIC_API_KEY: 'sk-x', ...env }),
    billingDisabled: () => false,
    hasActiveAccess: vi.fn().mockResolvedValue(true),
    usageDay: vi.fn().mockResolvedValue('2026-10-26'),
    globalDay: () => '2026-10-26',
    reserve: vi.fn().mockResolvedValue({ ok: true, used: 1, limit: 15 }),
    model: vi.fn().mockResolvedValue({ raw: good }),
    improve: vi.fn().mockResolvedValue(improved),
    context: vi.fn().mockResolvedValue(context),
    ...rest,
  };
}
const owner = { uid: 'u1', email: 'owner@example.com', emailVerified: true };
const call = async (d: PromoteDeps, body: unknown = { photo: { mediaType: 'image/jpeg', data: jpeg } }, user: Record<string, unknown> = owner) => {
  const r = res();
  await createPromoteHandler(d)({ ...user, body } as unknown as AuthedRequest, r as unknown as Response);
  return r;
};

describe('making a post', () => {
  it('returns the improved photo, the checked text and how to order, counted as a promote use', async () => {
    const d = deps();
    const r = await call(d);
    expect(r.code).toBe(200);
    expect(r.body.result).toMatchObject({
      image: Buffer.from('improved').toString('base64'), width: 2048, height: 1536, remaining: 14,
      orderLine: 'Order on WhatsApp: 98765 43210',
      reading: { menuItemId: 'm1', dishName: 'Butter Chicken', focus: { x: 0.5, y: 0.55 }, hashtags: good.hashtags },
    });
    expect(d.reserve).toHaveBeenCalledWith(expect.objectContaining({ uid: 'u1', feature: 'promote', perUserLimit: 15 }));
    expect(d.model).toHaveBeenCalledWith(expect.objectContaining({ photo: improved.forModel, language: 'en', menu: context.menu }));
    expect(d.context).toHaveBeenCalledWith('u1');
  });

  it('uses the limit set on the server', async () => {
    const d = deps({ env: { AI_PROMOTE_DAILY_LIMIT: '4' } });
    await call(d);
    expect(d.reserve).toHaveBeenCalledWith(expect.objectContaining({ perUserLimit: 4 }));
  });

  it('asks again with what was wrong, and returns nothing if that fails too', async () => {
    const model = vi.fn().mockResolvedValueOnce({ raw: { ...good, menuItemId: 'nope' } }).mockResolvedValueOnce({ raw: good });
    expect(await readPromoteValidated({ photo: Buffer.from('x'), ...context, language: 'en' }, model)).not.toBeNull();
    expect(model.mock.calls[1][0].problems).toEqual([expect.stringMatching(/menuItemId/)]);

    const d = deps({ model: vi.fn().mockResolvedValue({ raw: undefined }) });
    const r = await call(d);
    expect(d.model).toHaveBeenCalledTimes(2);
    expect(r.body).toMatchObject({ result: null, code: 'unverified', remaining: 14 });
  });

  it('refuses a photo that cannot be opened before counting anything', async () => {
    const d = deps({ improve: vi.fn().mockRejectedValue(new Error('corrupt')) });
    const r = await call(d);
    expect(r.code).toBe(400);
    expect(r.body.code).toBe('bad_photo');
    expect(d.reserve).not.toHaveBeenCalled();
  });

  it('refuses a bad request, an account without AI and one over its limit', async () => {
    expect((await call(deps(), { photo: null })).code).toBe(400);
    const blocked = deps({ hasActiveAccess: vi.fn().mockResolvedValue(false) });
    expect((await call(blocked)).code).toBe(402);
    expect(blocked.improve).not.toHaveBeenCalled();
    const spent = deps({ reserve: vi.fn().mockResolvedValue({ ok: false, reason: 'user_limit', used: 15, limit: 15 }) });
    const r = await call(spent);
    expect(r.code).toBe(429);
    expect(spent.model).not.toHaveBeenCalled();
  });

  it('maps a provider error to a message for the owner and never forwards its text', async () => {
    const err = Object.assign(new Error('secret provider detail sk-ant-123'), { status: 529 });
    const r = await call(deps({ model: vi.fn().mockRejectedValue(err) }));
    expect(r.body.code).toBe('model_error');
    expect(JSON.stringify(r.body)).not.toContain('sk-ant');
  });
});
