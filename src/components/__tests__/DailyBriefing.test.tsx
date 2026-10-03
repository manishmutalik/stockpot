import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';

const apiFetch = vi.fn();
vi.mock('../../utils/apiClient', () => ({ apiFetch: (...a: any[]) => apiFetch(...a) }));

import { DailyBriefing } from '../DailyBriefing';

const NOW = new Date('2026-06-30T10:00:00Z'); // 15:30 on 30 June in India: yesterday is 29 June
const materials: any[] = [{ id: 'flour', name: 'Flour', unit: 'kg', costPerUnit: 40, category: 'Raw Materials', initialStock: 10, remaining: 10, threshold: 2 }];
const menu: any[] = [{ id: 'cake', name: 'Chocolate Cake', sellingPrice: 100, recipe: [{ materialId: 'flour', amount: 500, unit: 'g' }] }];
let n = 0;
const order = (date: string, over: Record<string, any> = {}): any => ({
  id: `o${++n}`, menuItemId: 'cake', quantity: 1, date, unitPriceAtSale: 100, unitIngredientCostAtSale: 20, unitPackagingCostAtSale: 0,
  unitInputGstAtSale: 0, itemNameAtSale: 'Chocolate Cake', customerName: 'Priya Sharma', customerPhone: '+91 98450 10101', ...over,
});
const orders = [order('2026-06-29', { quantity: 3 }), order('2026-06-22', { quantity: 4 })];
const props = (over: Record<string, any> = {}) => ({
  orders, menu, materials, experiments: [], wastageLogs: [], currency: { code: 'INR', symbol: '₹' },
  settings: { name: 'Asha Bakes', gstApplicable: false, timezone: 'Asia/Kolkata' } as any, dataReady: true, now: NOW, ...over,
});

const reply = (status: number, body: any) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
const aiBriefing = { date: '2026-06-30', source: 'ai', createdAt: 1, refreshes: 0, content: { why: 'Profit moved {{fig:true_profit_change}} as {{name:item_cake}} sold less.', attention: [{ kind: 'low_stock', text: 'Watch {{fig:cash_tied_up}} tied up in stock.' }] } };
const route = (handlers: Record<string, () => Promise<any>>) => apiFetch.mockImplementation((url: string, init?: any) => {
  const key = `${init?.method ?? 'GET'} ${url}`;
  if (!handlers[key]) throw new Error(`unexpected call ${key}`);
  return handlers[key]();
});
const AVAILABLE = { 'GET /api/ai/status': () => reply(200, { available: true, limits: {} }) };
const posts = () => apiFetch.mock.calls.filter(c => c[1]?.method === 'POST');

beforeEach(() => { apiFetch.mockReset(); });
afterEach(() => vi.useRealTimers());

describe('when nothing should show', () => {
  it('shows nothing, and asks nothing, until the data has loaded', () => {
    render(<DailyBriefing {...props({ dataReady: false })} />);
    expect(screen.queryByRole('region')).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('shows nothing for a business with no orders', () => {
    render(<DailyBriefing {...props({ orders: [] })} />);
    expect(screen.queryByRole('region')).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it.each(['unavailable', 'subscription_required', 'not_allowed'])('shows nothing when AI is %s, quietly', async reason => {
    route({ 'GET /api/ai/status': () => reply(200, { available: false, reason }) });
    render(<DailyBriefing {...props()} />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(screen.queryByRole('region')).toBeNull();
    expect(posts()).toHaveLength(0);
  });

  it('shows nothing if the server cannot be reached or says no', async () => {
    apiFetch.mockImplementation(() => { throw new Error('offline'); });
    render(<DailyBriefing {...props()} />);
    await act(async () => {});
    expect(screen.queryByRole('region')).toBeNull();
    apiFetch.mockReset();
    route({ 'GET /api/ai/status': () => reply(500, {}) });
    render(<DailyBriefing {...props()} />);
    await act(async () => {});
    expect(screen.queryByRole('region')).toBeNull();
  });
});

describe('the demo', () => {
  it('shows a sample built from the demo data, labelled as one, and never asks for a briefing', async () => {
    route({ 'GET /api/ai/status': () => reply(200, { available: false, reason: 'demo_account' }) });
    render(<DailyBriefing {...props()} />);
    const card = await screen.findByRole('region', { name: "Yesterday's briefing" });
    expect(within(card).getByText('Sample')).toBeTruthy();
    expect(card.textContent).toContain('Yesterday (Mon 29 Jun): 1 order, ₹300 revenue and ₹240 true profit, down 25% on the same day last week.');
    expect(card.textContent).toMatch(/The biggest change was/);
    expect(card.textContent).toContain('Every figure here comes from the demo data.');
    expect(within(card).queryByRole('button', { name: /fresh explanation/ })).toBeNull();
    expect(posts()).toHaveLength(0);
  });
});

describe('when AI is offered', () => {
  it('asks once for yesterday with a snapshot, and shows the explanation with the app\'s own numbers in it', async () => {
    route({ ...AVAILABLE, 'POST /api/ai/briefing': () => reply(200, { briefing: aiBriefing, cached: false, remaining: 3 }) });
    render(<DailyBriefing {...props()} />);
    const card = await screen.findByRole('region', { name: "Yesterday's briefing" });
    await waitFor(() => expect(within(card).getByText('AI')).toBeTruthy());

    const [url, init] = posts()[0];
    expect(url).toBe('/api/ai/briefing');
    const sent = JSON.parse(init.body);
    expect(sent.refresh).toBe(false);
    expect(sent.snapshot.period).toEqual({ start: '2026-06-29', end: '2026-06-29' });
    expect(sent.snapshot.business.name).toBe('Asha Bakes');

    // The model's words with the app's numbers dropped in: -₹80 is 3 cakes' profit against last week's 4.
    expect(card.textContent).toContain('Profit moved -₹80 as Chocolate Cake sold less.');
    expect(card.textContent).toContain('Watch ₹400 tied up in stock.'); // 10 kg of flour at 40
    expect(card.textContent).toContain('Yesterday (Mon 29 Jun): 1 order, ₹300 revenue and ₹240 true profit, down 25% on the same day last week.');
    expect(card.textContent).not.toMatch(/\{\{|\}\}/);
  });

  it('sends nothing about customers\' names or phone numbers', async () => {
    route({ ...AVAILABLE, 'POST /api/ai/briefing': () => reply(200, { briefing: aiBriefing, cached: false }) });
    render(<DailyBriefing {...props()} />);
    await screen.findByText('AI');
    const body = posts()[0][1].body as string;
    expect(body).not.toMatch(/Priya|Sharma|98450/);
  });

  it('shows tiles from the app\'s figures and one bar for each of the last seven days', async () => {
    route({ ...AVAILABLE, 'POST /api/ai/briefing': () => reply(200, { briefing: aiBriefing, cached: true }) });
    const { container } = render(<DailyBriefing {...props()} />);
    const card = await screen.findByRole('region', { name: "Yesterday's briefing" });
    await screen.findByText('AI');
    expect(within(card).getByText('Revenue').nextElementSibling?.textContent).toBe('₹300');
    expect(within(card).getByText('True profit').nextElementSibling?.textContent).toBe('₹240');
    expect(container.querySelectorAll('[title*="Monday:"], [title*="Tuesday:"], [title*="Wednesday:"], [title*="Thursday:"], [title*="Friday:"], [title*="Saturday:"], [title*="Sunday:"]')).toHaveLength(7);
  });

  it('asks only once a day however often the data changes', async () => {
    route({ ...AVAILABLE, 'POST /api/ai/briefing': () => reply(200, { briefing: aiBriefing, cached: false }) });
    const { rerender } = render(<DailyBriefing {...props()} />);
    await screen.findByText('AI');
    rerender(<DailyBriefing {...props({ orders: [...orders, order('2026-06-30')] })} />);
    await act(async () => {});
    expect(posts()).toHaveLength(1);
    expect(apiFetch.mock.calls.filter(c => c[0] === '/api/ai/status')).toHaveLength(1);
  });

  it('shows a loading line while the briefing is being prepared', async () => {
    let finish: (v: any) => void = () => {};
    route({ ...AVAILABLE, 'POST /api/ai/briefing': () => new Promise(r => { finish = r; }) });
    render(<DailyBriefing {...props()} />);
    expect(await screen.findByText(/Preparing yesterday's briefing/)).toBeTruthy();
    await act(async () => { finish({ ok: true, status: 200, json: async () => ({ briefing: aiBriefing }) }); });
    expect(await screen.findByText('AI')).toBeTruthy();
  });
});

describe('when the explanation cannot be used', () => {
  it('builds the summary from the numbers when the AI answer could not be checked', async () => {
    route({ ...AVAILABLE, 'POST /api/ai/briefing': () => reply(200, { briefing: { date: '2026-06-30', source: 'fallback', createdAt: 1, refreshes: 0 }, cached: false }) });
    render(<DailyBriefing {...props()} />);
    const card = await screen.findByRole('region', { name: "Yesterday's briefing" });
    await waitFor(() => expect(within(card).getByText('Summary')).toBeTruthy());
    expect(card.textContent).toContain('The AI explanation could not be checked');
    expect(card.textContent).toMatch(/The biggest change was/);
  });

  it('does not show an old explanation whose figures no longer exist, and says so', async () => {
    const stale = { ...aiBriefing, content: { why: 'Profit moved {{fig:driver_gone}}.', attention: [] } };
    route({ ...AVAILABLE, 'POST /api/ai/briefing': () => reply(200, { briefing: stale, cached: true }) });
    render(<DailyBriefing {...props()} />);
    const card = await screen.findByRole('region', { name: "Yesterday's briefing" });
    await waitFor(() => expect(card.textContent).toContain('Your data has changed since this was written'));
    expect(card.textContent).not.toContain('driver_gone');
    expect(card.textContent).toMatch(/The biggest change was/);
  });

  it('shows the summary, with the reason, when the AI service says it is busy or the allowance is used', async () => {
    route({ ...AVAILABLE, 'POST /api/ai/briefing': () => reply(503, { error: 'The AI service is busy. Please try again in a minute.', code: 'model_error' }) });
    render(<DailyBriefing {...props()} />);
    const card = await screen.findByRole('region', { name: "Yesterday's briefing" });
    await waitFor(() => expect(card.textContent).toContain('The AI service is busy. Please try again in a minute. This summary is built from your numbers.'));
    expect(within(card).getByText('Summary')).toBeTruthy();
  });

  it('shows the summary when the briefing request cannot be sent at all', async () => {
    route({ ...AVAILABLE, 'POST /api/ai/briefing': () => Promise.reject(new Error('offline')) });
    render(<DailyBriefing {...props()} />);
    const card = await screen.findByRole('region', { name: "Yesterday's briefing" });
    await waitFor(() => expect(card.textContent).toContain('could not be reached'));
  });
});

describe('data changing while the request is in flight', () => {
  it('still shows the briefing: a change in the data must not cancel the once-a-day request', async () => {
    let finishStatus: (v: any) => void = () => {};
    route({
      'GET /api/ai/status': () => new Promise(r => { finishStatus = r; }),
      'POST /api/ai/briefing': () => reply(200, { briefing: aiBriefing, cached: false }),
    });
    const { rerender } = render(<DailyBriefing {...props()} />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    rerender(<DailyBriefing {...props({ orders: [...orders, order('2026-06-30')] })} />); // new data arrives
    await act(async () => { finishStatus({ ok: true, status: 200, json: async () => ({ available: true }) }); });
    expect(await screen.findByText('AI')).toBeTruthy();
    expect(posts()).toHaveLength(1);
  });

  it('asks for no briefing, and spends nothing, if the screen was left while it checked what AI offers', async () => {
    let finishStatus: (v: any) => void = () => {};
    route({ 'GET /api/ai/status': () => new Promise(r => { finishStatus = r; }), 'POST /api/ai/briefing': () => reply(200, { briefing: aiBriefing }) });
    const { unmount } = render(<DailyBriefing {...props()} />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => { finishStatus({ ok: true, status: 200, json: async () => ({ available: true }) }); });
    expect(posts()).toHaveLength(0);
  });
});

describe('another tab is preparing it', () => {
  it('waits a few seconds and asks again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let calls = 0;
    route({ ...AVAILABLE, 'POST /api/ai/briefing': () => (++calls === 1 ? reply(409, { error: 'preparing', code: 'generating' }) : reply(200, { briefing: aiBriefing, cached: true })) });
    render(<DailyBriefing {...props()} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    expect(await screen.findByText('AI')).toBeTruthy();
    expect(calls).toBe(2);
  });

  it('gives up after a few waits and shows the summary', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    route({ ...AVAILABLE, 'POST /api/ai/briefing': () => reply(409, { error: "Today's briefing is being prepared.", code: 'generating' }) });
    render(<DailyBriefing {...props()} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(4100 * 4); });
    expect((await screen.findByRole('region')).textContent).toContain("Today's briefing is being prepared.");
    expect(posts()).toHaveLength(4);
  });
});

describe('refreshing', () => {
  it('asks for a fresh explanation with refresh set, and shows the new one', async () => {
    let calls = 0;
    const second = { ...aiBriefing, refreshes: 1, content: { why: 'Orders slowed, so {{name:item_cake}} earned less.', attention: [] } };
    route({ ...AVAILABLE, 'POST /api/ai/briefing': () => reply(200, { briefing: ++calls === 1 ? aiBriefing : second, cached: false, remaining: 2 }) });
    render(<DailyBriefing {...props()} />);
    await screen.findByText('AI');
    fireEvent.click(screen.getByRole('button', { name: 'Write a fresh explanation' }));
    await screen.findByText(/Orders slowed, so Chocolate Cake earned less\./);
    expect(JSON.parse(posts()[1][1].body).refresh).toBe(true);
  });

  it('is disabled once the day\'s allowance is used', async () => {
    route({ ...AVAILABLE, 'POST /api/ai/briefing': () => reply(200, { briefing: aiBriefing, cached: false, remaining: 0 }) });
    render(<DailyBriefing {...props()} />);
    await screen.findByText('AI');
    expect((screen.getByRole('button', { name: 'Write a fresh explanation' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps the explanation it has if a refresh fails', async () => {
    let calls = 0;
    route({ ...AVAILABLE, 'POST /api/ai/briefing': () => (++calls === 1 ? reply(200, { briefing: aiBriefing, cached: false, remaining: 2 }) : reply(429, { error: 'used up', code: 'daily_limit' })) });
    render(<DailyBriefing {...props()} />);
    await screen.findByText('AI');
    fireEvent.click(screen.getByRole('button', { name: 'Write a fresh explanation' }));
    await waitFor(() => expect(calls).toBe(2));
    await act(async () => {});
    expect(screen.getByText('AI')).toBeTruthy();
    expect(screen.getByText(/Profit moved -₹80/)).toBeTruthy();
  });
});
