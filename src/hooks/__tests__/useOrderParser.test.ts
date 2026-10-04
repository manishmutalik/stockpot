import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const apiFetch = vi.fn();
vi.mock('../../utils/apiClient', () => ({ apiFetch: (...a: any[]) => apiFetch(...a) }));

import { useOrderParser } from '../useOrderParser';

const materials: any[] = [{ id: 'flour', name: 'Flour', unit: 'kg', costPerUnit: 40, category: 'Raw Materials', initialStock: 10, remaining: 10, threshold: 2 }];
const menu: any[] = [
  { id: 'cake', name: 'Chocolate Cake', sellingPrice: 100, recipe: [] },
  { id: 'cookie', name: 'Butter Cookie', sellingPrice: 20, recipe: [] },
];
const orders: any[] = [{
  id: 'o1', menuItemId: 'cake', quantity: 1, date: '2026-09-20', unitPriceAtSale: 100, unitIngredientCostAtSale: 20, unitPackagingCostAtSale: 0, unitInputGstAtSale: 0,
  itemNameAtSale: 'Chocolate Cake', customerName: 'Priya Sharma', customerPhone: '+91 98450 10101',
}];
const settings: any = { name: 'Asha Bakes', gstApplicable: false, timezone: 'Asia/Kolkata' };
const input = (over: Record<string, any> = {}) => ({ orders, menu, materials, settings, signedIn: true, dataReady: true, ...over });

const reply = (status: number, body: any) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
const route = (handlers: Record<string, () => Promise<any>>) => apiFetch.mockImplementation((url: string, init?: any) => {
  const key = `${init?.method ?? 'GET'} ${url}`;
  if (!handlers[key]) throw new Error(`unexpected call ${key}`);
  return handlers[key]();
});
const AVAILABLE = { 'GET /api/ai/status': () => reply(200, { available: true, limits: {} }) };
const posts = () => apiFetch.mock.calls.filter(c => c[0] === '/api/ai/parse-order');
const sent = () => JSON.parse(posts()[0][1].body);

beforeEach(() => { apiFetch.mockReset(); });

describe('availability', () => {
  it.each(['demo_account', 'unavailable', 'subscription_required', 'not_allowed'])('is not offered when AI is %s', async reason => {
    route({ 'GET /api/ai/status': () => reply(200, { available: false, reason }) });
    const { result } = renderHook(() => useOrderParser(input()));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(result.current).toBeNull();
  });

  it('asks nothing until signed in and the data has loaded, and is not offered if the server cannot be reached', async () => {
    const { result, rerender } = renderHook((p: any) => useOrderParser(p), { initialProps: input({ dataReady: false }) });
    expect(apiFetch).not.toHaveBeenCalled();
    apiFetch.mockImplementation(() => { throw new Error('offline'); });
    rerender(input());
    await act(async () => {});
    expect(result.current).toBeNull();
  });

  it('is offered when AI is available, and asks only once', async () => {
    route(AVAILABLE);
    const { result, rerender } = renderHook((p: any) => useOrderParser(p), { initialProps: input() });
    await waitFor(() => expect(result.current).not.toBeNull());
    rerender(input({ orders: [...orders] }));
    await act(async () => {});
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});

describe('parsing', () => {
  const ready = async (handlers: Record<string, () => Promise<any>> = {}, over: Record<string, any> = {}) => {
    route({ ...AVAILABLE, ...handlers });
    const hook = renderHook(() => useOrderParser(input(over)));
    await waitFor(() => expect(hook.result.current).not.toBeNull());
    return hook;
  };

  it('sends the message with the phone number removed and the known customer\'s name replaced by a label, plus the menu ids and names', async () => {
    const { result } = await ready({ 'POST /api/ai/parse-order': () => reply(200, { parsed: { lineItems: [] }, remaining: 29 }) });
    await act(async () => { await result.current!.parse('Hi, Priya Sharma here (+91 77777 88888). 2 cakes please'); });
    const body = sent();
    expect(body.text).toMatch(/^Hi, C-[0-9A-Z]+ here \(\[phone\]\)\. 2 cakes please$/);
    expect(JSON.stringify(body)).not.toContain('Priya');
    expect(JSON.stringify(body)).not.toContain('77777');
    expect(body.menuItems).toEqual([{ id: 'cake', name: 'Chocolate Cake' }, { id: 'cookie', name: 'Butter Cookie' }]);
  });

  it('turns the answer into form values: items, the new customer\'s name, the phone found in the message, the date', async () => {
    const parsed = { lineItems: [{ nameAsWritten: '2 cakes', menuItemId: 'cake', quantity: 2 }], customerName: 'Anita', when: 'tomorrow', paymentStatus: 'unpaid' };
    const { result } = await ready({ 'POST /api/ai/parse-order': () => reply(200, { parsed, remaining: 28 }) });
    let outcome: any;
    await act(async () => { outcome = await result.current!.parse('Anita here, 2 cakes tomorrow, pay later. +91 77777 88888'); });
    expect(outcome.ok).toBe(true);
    expect(outcome.remaining).toBe(28);
    expect(outcome.form).toMatchObject({
      lineItems: [{ menuItemId: 'cake', quantity: 2 }], customerName: 'Anita', customerPhone: '+91 77777 88888', knownCustomer: false, payLater: true,
    });
    expect(outcome.form.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('fills a known customer\'s name and phone number from their own record', async () => {
    let label = '';
    apiFetch.mockImplementation(async (url: string, init?: any) => {
      if (url === '/api/ai/status') return reply(200, { available: true });
      label = /C-[0-9A-Z]+/.exec(JSON.parse(init.body).text)![0];
      return reply(200, { parsed: { lineItems: [], customerLabel: label }, remaining: 1 });
    });
    const { result } = renderHook(() => useOrderParser(input()));
    await waitFor(() => expect(result.current).not.toBeNull());
    let outcome: any;
    await act(async () => { outcome = await result.current!.parse('Priya Sharma wants a cake'); });
    expect(outcome.form).toMatchObject({ customerName: 'Priya Sharma', customerPhone: '+91 98450 10101', knownCustomer: true });
  });

  it('does not call the server for an empty message or an empty menu', async () => {
    const { result } = await ready();
    let outcome: any;
    await act(async () => { outcome = await result.current!.parse('   '); });
    expect(outcome).toMatchObject({ ok: false });
    expect(posts()).toHaveLength(0);

    const empty = await ready({}, { menu: [] });
    await act(async () => { outcome = await empty.result.current!.parse('2 cakes'); });
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/menu/);
  });

  it('passes on the server\'s message when it could not read the message, or a limit was reached', async () => {
    const { result } = await ready({ 'POST /api/ai/parse-order': () => reply(200, { parsed: null, code: 'unverified', error: 'I could not read that message reliably.' }) });
    let outcome: any;
    await act(async () => { outcome = await result.current!.parse('???'); });
    expect(outcome).toEqual({ ok: false, message: 'I could not read that message reliably.' });

    const limited = await ready({ 'POST /api/ai/parse-order': () => reply(429, { error: 'You have used all of today\'s AI requests for this feature. It resets tomorrow.' }) });
    await act(async () => { outcome = await limited.result.current!.parse('2 cakes'); });
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/resets tomorrow/);
  });

  it('says so when the server cannot be reached', async () => {
    apiFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/status') return reply(200, { available: true });
      throw new Error('offline');
    });
    const { result } = renderHook(() => useOrderParser(input()));
    await waitFor(() => expect(result.current).not.toBeNull());
    let outcome: any;
    await act(async () => { outcome = await result.current!.parse('2 cakes'); });
    expect(outcome).toMatchObject({ ok: false, message: expect.stringMatching(/could not be reached/) });
  });
});
