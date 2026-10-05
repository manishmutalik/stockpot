import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const apiFetch = vi.fn();
vi.mock('../../utils/apiClient', () => ({ apiFetch: (...a: any[]) => apiFetch(...a) }));

import { useProductionParser } from '../useProductionParser';

const menu: any[] = [
  { id: 'croissant', name: 'Butter Croissant', sellingPrice: 150, recipe: [] },
  { id: 'muffin', name: 'Chocolate Muffin', sellingPrice: 120, recipe: [] },
];
const settings: any = { name: 'Asha Bakes', gstApplicable: false, timezone: 'Asia/Kolkata' };
const input = (over: Record<string, any> = {}) => ({ menu, settings, signedIn: true, dataReady: true, ...over });

const reply = (status: number, body: any) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
const route = (handlers: Record<string, () => Promise<any>>) => apiFetch.mockImplementation((url: string, init?: any) => {
  const key = `${init?.method ?? 'GET'} ${url}`;
  if (!handlers[key]) throw new Error(`unexpected call ${key}`);
  return handlers[key]();
});
const AVAILABLE = { 'GET /api/ai/status': () => reply(200, { available: true, limits: {} }) };
const posts = () => apiFetch.mock.calls.filter(c => c[0] === '/api/ai/parse-production-run');
const sent = () => JSON.parse(posts()[0][1].body);

beforeEach(() => { apiFetch.mockReset(); });

describe('availability', () => {
  it.each(['demo_account', 'unavailable', 'subscription_required', 'not_allowed'])('is not offered when AI is %s', async reason => {
    route({ 'GET /api/ai/status': () => reply(200, { available: false, reason }) });
    const { result } = renderHook(() => useProductionParser(input()));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(result.current).toBeNull();
  });

  it('asks nothing until signed in and the data has loaded, and is not offered if the server cannot be reached', async () => {
    const { result, rerender } = renderHook((p: any) => useProductionParser(p), { initialProps: input({ dataReady: false }) });
    expect(apiFetch).not.toHaveBeenCalled();
    apiFetch.mockImplementation(() => { throw new Error('offline'); });
    rerender(input());
    await act(async () => {});
    expect(result.current).toBeNull();
  });

  it('is offered when AI is available, and asks only once', async () => {
    route(AVAILABLE);
    const { result, rerender } = renderHook((p: any) => useProductionParser(p), { initialProps: input() });
    await waitFor(() => expect(result.current).not.toBeNull());
    rerender(input({ menu: [...menu] }));
    await act(async () => {});
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});

describe('parsing', () => {
  const ready = async (handlers: Record<string, () => Promise<any>> = {}, over: Record<string, any> = {}) => {
    route({ ...AVAILABLE, ...handlers });
    const hook = renderHook(() => useProductionParser(input(over)));
    await waitFor(() => expect(hook.result.current).not.toBeNull());
    return hook;
  };

  it('sends the note with a phone number removed, plus the menu ids and names', async () => {
    const { result } = await ready({ 'POST /api/ai/parse-production-run': () => reply(200, { parsed: { lineItems: [] }, remaining: 29 }) });
    await act(async () => { await result.current!.parse('Made 40 croissants today, call +91 77777 88888'); });
    const body = sent();
    expect(body.text).toBe('Made 40 croissants today, call [phone]');
    expect(JSON.stringify(body)).not.toContain('77777');
    expect(body.menuItems).toEqual([{ id: 'croissant', name: 'Butter Croissant' }, { id: 'muffin', name: 'Chocolate Muffin' }]);
  });

  it('turns the answer into form values, the date worked out here and the yield worked out from the waste', async () => {
    const parsed = { lineItems: [{ nameAsWritten: 'croissants', menuItemId: 'croissant', quantity: 40, wasteUnits: 3 }], when: 'yesterday', notes: 'new oven' };
    const { result } = await ready({ 'POST /api/ai/parse-production-run': () => reply(200, { parsed, remaining: 28 }) });
    let outcome: any;
    await act(async () => { outcome = await result.current!.parse('Made 40 croissants yesterday, 3 burnt, new oven'); });
    expect(outcome.ok).toBe(true);
    expect(outcome.remaining).toBe(28);
    expect(outcome.form).toMatchObject({ rows: [{ recipeId: 'croissant', quantity: 40 }], yieldQty: 37, notes: 'new oven' });
    expect(outcome.form.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('does not call the server for an empty note or an empty menu', async () => {
    const { result } = await ready();
    let outcome: any;
    await act(async () => { outcome = await result.current!.parse('   '); });
    expect(outcome).toMatchObject({ ok: false });
    expect(posts()).toHaveLength(0);
    const empty = await ready({}, { menu: [] });
    await act(async () => { outcome = await empty.result.current!.parse('40 croissants'); });
    expect(outcome.message).toMatch(/menu/);
  });

  it('passes on the server\'s message when it could not read the note, or a limit was reached', async () => {
    const { result } = await ready({ 'POST /api/ai/parse-production-run': () => reply(200, { parsed: null, code: 'unverified', error: 'I could not read that note reliably.' }) });
    let outcome: any;
    await act(async () => { outcome = await result.current!.parse('???'); });
    expect(outcome).toEqual({ ok: false, message: 'I could not read that note reliably.' });
    const limited = await ready({ 'POST /api/ai/parse-production-run': () => reply(429, { error: 'You have used all of today\'s AI requests for this feature. It resets tomorrow.' }) });
    await act(async () => { outcome = await limited.result.current!.parse('40 croissants'); });
    expect(outcome.message).toMatch(/resets tomorrow/);
  });

  it('says so when the server cannot be reached', async () => {
    apiFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/status') return reply(200, { available: true });
      throw new Error('offline');
    });
    const { result } = renderHook(() => useProductionParser(input()));
    await waitFor(() => expect(result.current).not.toBeNull());
    let outcome: any;
    await act(async () => { outcome = await result.current!.parse('40 croissants'); });
    expect(outcome).toMatchObject({ ok: false, message: expect.stringMatching(/could not be reached/) });
  });
});
