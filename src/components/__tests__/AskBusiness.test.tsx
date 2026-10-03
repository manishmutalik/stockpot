import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';

const apiFetch = vi.fn();
vi.mock('../../utils/apiClient', () => ({ apiFetch: (...a: any[]) => apiFetch(...a) }));

import { AskBusiness } from '../AskBusiness';

const NOW = new Date('2026-06-30T10:00:00Z');
const materials: any[] = [{ id: 'flour', name: 'Flour', unit: 'kg', costPerUnit: 40, category: 'Raw Materials', initialStock: 10, remaining: 10, threshold: 2 }];
const menu: any[] = [{ id: 'cake', name: 'Chocolate Cake', sellingPrice: 100, recipe: [{ materialId: 'flour', amount: 500, unit: 'g' }] }];
let n = 0;
const order = (date: string, over: Record<string, any> = {}): any => ({
  id: `o${++n}`, menuItemId: 'cake', quantity: 1, date, unitPriceAtSale: 100, unitIngredientCostAtSale: 20, unitPackagingCostAtSale: 0,
  unitInputGstAtSale: 0, itemNameAtSale: 'Chocolate Cake', customerName: 'Priya Sharma', customerPhone: '+91 98450 10101', ...over,
});
const orders = [order('2026-06-29', { quantity: 3 }), order('2026-06-10', { quantity: 4 })];
const props = (over: Record<string, any> = {}) => ({
  orders, menu, materials, experiments: [], wastageLogs: [], currency: { code: 'INR', symbol: '₹' },
  settings: { name: 'Asha Bakes', gstApplicable: false, timezone: 'Asia/Kolkata' } as any, dataReady: true, signedIn: true, now: NOW, ...over,
});

const reply = (status: number, body: any) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
const AVAILABLE = (remaining = 30) => () => reply(200, { available: true, limits: { chat: { used: 30 - remaining, limit: 30, remaining } } });
const route = (handlers: Record<string, () => Promise<any>>) => apiFetch.mockImplementation((url: string, init?: any) => {
  const key = `${init?.method ?? 'GET'} ${url}`;
  if (!handlers[key]) throw new Error(`unexpected call ${key}`);
  return handlers[key]();
});
const chatCalls = () => apiFetch.mock.calls.filter(c => c[0] === '/api/ai/chat');
const sentBody = (i = 0) => JSON.parse(chatCalls()[i][1].body);

const openPanel = async () => {
  const button = await screen.findByRole('button', { name: 'Ask your business' });
  fireEvent.click(button);
  return screen.findByRole('dialog', { name: 'Ask your business' });
};
const ask = (panel: HTMLElement, text: string) => {
  fireEvent.change(within(panel).getByLabelText('Your question'), { target: { value: text } });
  fireEvent.click(within(panel).getByRole('button', { name: 'Send' }));
};

beforeEach(() => { apiFetch.mockReset(); });

describe('when it should not show', () => {
  it('shows nothing, and asks nothing, until signed in and the data has loaded', () => {
    render(<AskBusiness {...props({ dataReady: false })} />);
    render(<AskBusiness {...props({ signedIn: false })} />);
    expect(screen.queryByRole('button', { name: 'Ask your business' })).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it.each(['demo_account', 'unavailable', 'subscription_required', 'not_allowed'])('shows nothing when AI is %s, so never in the demo', async reason => {
    route({ 'GET /api/ai/status': () => reply(200, { available: false, reason }) });
    render(<AskBusiness {...props()} />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(screen.queryByRole('button', { name: 'Ask your business' })).toBeNull();
  });

  it('shows nothing if the server cannot be reached or says no', async () => {
    apiFetch.mockImplementation(() => { throw new Error('offline'); });
    render(<AskBusiness {...props()} />);
    await act(async () => {});
    expect(screen.queryByRole('button', { name: 'Ask your business' })).toBeNull();
  });

  it('asks the server what is offered only once', async () => {
    route({ 'GET /api/ai/status': AVAILABLE() });
    const { rerender } = render(<AskBusiness {...props()} />);
    await screen.findByRole('button', { name: 'Ask your business' });
    rerender(<AskBusiness {...props({ orders: [...orders] })} />);
    await act(async () => {});
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});

describe('the panel', () => {
  it('opens with starter questions, the period choice and the allowance left, and closes again', async () => {
    route({ 'GET /api/ai/status': AVAILABLE(27) });
    render(<AskBusiness {...props()} />);
    const panel = await openPanel();
    expect(within(panel).getByText('27 questions left today')).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'What should I stop selling?' })).toBeTruthy();
    expect((within(panel).getByLabelText('Ask about') as HTMLSelectElement).value).toBe('month');
    fireEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ask your business' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says "1 question" in the singular', async () => {
    route({ 'GET /api/ai/status': AVAILABLE(1) });
    render(<AskBusiness {...props()} />);
    expect(within(await openPanel()).getByText('1 question left today')).toBeTruthy();
  });
});

describe('asking', () => {
  const ANSWER = 'Profit moved {{fig:true_profit_change}} as {{name:item_cake}} sold less.\n- {{name:item_cake}} led.';

  it('sends the question with a snapshot of the chosen period and shows the answer with the app\'s own numbers', async () => {
    route({ 'GET /api/ai/status': AVAILABLE(), 'POST /api/ai/chat': () => reply(200, { answer: ANSWER, remaining: 29 }) });
    render(<AskBusiness {...props()} />);
    const panel = await openPanel();
    ask(panel, 'Why did my profit change?');
    await waitFor(() => expect(within(panel).getByText(/Profit moved/)).toBeTruthy());

    const body = sentBody();
    expect(body.question).toBe('Why did my profit change?');
    expect(body.snapshot.period).toEqual({ start: '2026-06-01', end: '2026-06-30' });
    expect(body.snapshot.comparison.label).toBe('the same stretch of last month');
    expect(body.history).toEqual([]);

    const answer = within(panel).getByText(/Profit moved/);
    expect(answer.textContent).toContain('Chocolate Cake');
    expect(answer.textContent).toMatch(/Profit moved [+-]?₹[\d,]+ as Chocolate Cake sold less\./);
    expect(answer.textContent).not.toContain('{{');
    expect(within(panel).getByText('29 questions left today')).toBeTruthy();
    expect((within(panel).getByLabelText('Your question') as HTMLTextAreaElement).value).toBe('');
  });

  it('asks about the period chosen', async () => {
    route({ 'GET /api/ai/status': AVAILABLE(), 'POST /api/ai/chat': () => reply(200, { answer: 'Fine.', remaining: 29 }) });
    render(<AskBusiness {...props()} />);
    const panel = await openPanel();
    fireEvent.change(within(panel).getByLabelText('Ask about'), { target: { value: 'last_month' } });
    ask(panel, 'How was it?');
    await waitFor(() => expect(within(panel).getByText('Fine.')).toBeTruthy());
    expect(sentBody().snapshot.period).toEqual({ start: '2026-05-01', end: '2026-05-31' });
    expect(within(panel).getAllByText('Last month')).toHaveLength(2); // the choice, and the period the answer was about
  });

  it('sends a starter question when it is chosen', async () => {
    route({ 'GET /api/ai/status': AVAILABLE(), 'POST /api/ai/chat': () => reply(200, { answer: 'Fine.', remaining: 29 }) });
    render(<AskBusiness {...props()} />);
    const panel = await openPanel();
    fireEvent.click(within(panel).getByRole('button', { name: 'Why did my profit change?' }));
    await waitFor(() => expect(chatCalls()).toHaveLength(1));
    expect(sentBody().question).toBe('Why did my profit change?');
  });

  it('never sends a customer\'s name or phone number: the name becomes a label, and the answer shows the name again', async () => {
    route({ 'GET /api/ai/status': AVAILABLE() });
    let label = '';
    apiFetch.mockImplementation(async (url: string, init?: any) => {
      if (url === '/api/ai/status') return AVAILABLE()();
      const sent = JSON.parse(init.body);
      label = sent.snapshot.customers.mentioned[0].label;
      return reply(200, { answer: `{{cust:${label}}} ordered recently.`, remaining: 29 });
    });
    render(<AskBusiness {...props()} />);
    const panel = await openPanel();
    ask(panel, 'How is Priya Sharma doing? Call +91 98450 10101');
    await waitFor(() => expect(within(panel).getByText('Priya Sharma ordered recently.')).toBeTruthy());

    const raw = chatCalls()[0][1].body as string;
    expect(raw).not.toContain('Priya');
    expect(raw).not.toContain('Sharma');
    expect(raw).not.toContain('98450');
    expect(sentBody().question).toBe(`How is ${label} doing? Call [number]`);
    expect(within(panel).getByText('How is Priya Sharma doing? Call +91 98450 10101')).toBeTruthy(); // the owner sees what they typed
  });

  it('sends the last few answered exchanges as history, with the answers still in tokens', async () => {
    route({ 'GET /api/ai/status': AVAILABLE(), 'POST /api/ai/chat': () => reply(200, { answer: ANSWER, remaining: 29 }) });
    render(<AskBusiness {...props()} />);
    const panel = await openPanel();
    ask(panel, 'First?');
    await waitFor(() => expect(within(panel).getAllByText(/Profit moved/)).toHaveLength(1));
    ask(panel, 'Second?');
    await waitFor(() => expect(chatCalls()).toHaveLength(2));
    expect(sentBody(1).history).toEqual([{ question: 'First?', answer: ANSWER }]);
  });

  it('shows the owner a failure, and keeps the question out of the history', async () => {
    let calls = 0;
    apiFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/status') return AVAILABLE()();
      return ++calls === 1 ? reply(200, { answer: null, code: 'unverified', error: 'I could not give a checked answer to that.', remaining: 29 }) : reply(200, { answer: 'Fine.', remaining: 28 });
    });
    render(<AskBusiness {...props()} />);
    const panel = await openPanel();
    ask(panel, 'Strange question');
    await waitFor(() => expect(within(panel).getByText('I could not give a checked answer to that.')).toBeTruthy());
    expect(within(panel).getByText('29 questions left today')).toBeTruthy(); // that question was counted
    ask(panel, 'Another');
    await waitFor(() => expect(within(panel).getByText('Fine.')).toBeTruthy());
    expect(sentBody(1).history).toEqual([]);
  });

  it('says so when the server cannot be reached', async () => {
    apiFetch.mockImplementation(async (url: string) => {
      if (url === '/api/ai/status') return AVAILABLE()();
      throw new Error('offline');
    });
    render(<AskBusiness {...props()} />);
    const panel = await openPanel();
    ask(panel, 'Hello?');
    await waitFor(() => expect(within(panel).getByText(/could not be reached/)).toBeTruthy());
  });

  it('stops offering questions once the day\'s allowance is used', async () => {
    route({ 'GET /api/ai/status': AVAILABLE(), 'POST /api/ai/chat': () => reply(429, { error: 'You have used all of today\'s AI requests for this feature. It resets tomorrow.', code: 'daily_limit' }) });
    render(<AskBusiness {...props()} />);
    const panel = await openPanel();
    ask(panel, 'One more?');
    await waitFor(() => expect(within(panel).getByText(/resets tomorrow/)).toBeTruthy());
    expect(within(panel).getByText('0 questions left today')).toBeTruthy();
    expect((within(panel).getByLabelText('Your question') as HTMLTextAreaElement).disabled).toBe(true);
    expect((within(panel).getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not send an empty question, or a second one while waiting', async () => {
    let release: (v: any) => void = () => {};
    apiFetch.mockImplementation((url: string) => (url === '/api/ai/status' ? AVAILABLE()() : new Promise(r => { release = r; })));
    render(<AskBusiness {...props()} />);
    const panel = await openPanel();
    expect((within(panel).getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
    ask(panel, 'First?');
    await waitFor(() => expect(within(panel).getByText(/Looking at your numbers/)).toBeTruthy());
    ask(panel, 'Second?');
    expect(chatCalls()).toHaveLength(1);
    await act(async () => { release({ ok: true, status: 200, json: async () => ({ answer: 'Done.', remaining: 29 }) }); });
    await waitFor(() => expect(within(panel).getByText('Done.')).toBeTruthy());
  });
});
