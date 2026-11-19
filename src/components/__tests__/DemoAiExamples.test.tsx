import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const apiFetch = vi.fn();
vi.mock('../../utils/apiClient', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));

import { AddOrderModal } from '../AddOrderModal';
import { AskBusiness, DEMO_ASK_OWN, OPEN_ASK_EVENT } from '../AskBusiness';
import { DemoAiCard } from '../DemoAiCard';
import { PromoteView } from '../../views/PromoteView';
import { DEMO_ORDER, DEMO_PROMOTE_NOTE, DEMO_PROMOTE_PHOTO, DEMO_QUESTIONS } from '../../utils/demoAi';
import { buildDemoData } from '../../utils/demoData';
import { todayInZone } from '../../utils/localDate';
import type { BakerySettings } from '../../types';
import type { Promoter } from '../../hooks/usePromote';

beforeEach(() => {
  apiFetch.mockReset();
  // The demo account: the server says AI is not for it.
  apiFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ available: false, reason: 'demo_account' }) });
});

describe('the order message box in the demo', () => {
  const menu = [{ id: 'menu_muffin', name: 'Chocolate Muffin', sellingPrice: 120, finishedGoodsStock: 10 }];
  const open = () => {
    const parse = vi.fn().mockResolvedValue({ ok: false, message: 'x' });
    render(<AddOrderModal isOpen onClose={vi.fn()} menu={menu as never} onSave={vi.fn()} currency={{ symbol: '₹' }} orderParser={{ parse }} example={DEMO_ORDER} today="2026-11-19" />);
    return parse;
  };

  it('starts with the example and its note, and reads what is in the box', async () => {
    const parse = open();
    const box = screen.getByLabelText(/Fill from a message/) as HTMLTextAreaElement;
    expect(box.value).toBe(DEMO_ORDER.text);
    expect(screen.getByText(/A real kind of WhatsApp order/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Join the waitlist' }).getAttribute('href')).toBe('/#waitlist');
    expect(screen.queryByRole('button', { name: 'Put the example back' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Fill the form' }));
    await waitFor(() => expect(parse).toHaveBeenCalledWith(DEMO_ORDER.text));
  });

  it('puts the example back after the visitor types their own', () => {
    open();
    const box = screen.getByLabelText(/Fill from a message/) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: '2 muffins for Rahul' } });
    fireEvent.click(screen.getByRole('button', { name: 'Put the example back' }));
    expect(box.value).toBe(DEMO_ORDER.text);
  });

  it('leaves the box empty outside the demo', () => {
    render(<AddOrderModal isOpen onClose={vi.fn()} menu={menu as never} onSave={vi.fn()} currency={{ symbol: '₹' }} orderParser={{ parse: vi.fn() }} today="2026-11-19" />);
    expect((screen.getByLabelText(/Fill from a message/) as HTMLTextAreaElement).value).toBe('');
    expect(screen.queryByText(/Demo example/)).toBeNull();
  });
});

describe('Ask in the demo', () => {
  const today = todayInZone(undefined);
  const demo = buildDemoData('demo', today);
  const renderAsk = () => render(
    <AskBusiness orders={demo.orders} menu={demo.menu} materials={demo.materials.map(m => ({ ...m, remaining: m.initialStock }))} experiments={demo.experiments}
      wastageLogs={[]} productionRuns={demo.productionRuns} priceLog={demo.priceLog} settings={demo.settings as unknown as BakerySettings}
      currency={{ code: 'INR', symbol: '₹' }} dataReady signedIn demo />,
  );

  it('opens from the demo card, offers its questions, and answers from the demo kitchen’s numbers without asking the server', async () => {
    renderAsk();
    window.dispatchEvent(new Event(OPEN_ASK_EVENT));
    const panel = await screen.findByRole('dialog', { name: 'Ask your business' });
    expect(within(panel).getByText('Demo: example questions')).toBeTruthy();
    for (const q of DEMO_QUESTIONS) expect(within(panel).getByRole('button', { name: q })).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: DEMO_QUESTIONS[0] }));
    await waitFor(() => expect(within(panel).getByText(/In this period you made ₹[\d,]+ of true profit/)).toBeTruthy(), { timeout: 3000 });
    expect(apiFetch.mock.calls.some(c => c[0] === '/api/ai/chat')).toBe(false);
  });

  it('points a question of the visitor’s own to the examples', async () => {
    renderAsk();
    window.dispatchEvent(new Event(OPEN_ASK_EVENT));
    const panel = await screen.findByRole('dialog', { name: 'Ask your business' });
    fireEvent.change(within(panel).getByLabelText('Your question'), { target: { value: 'What should I bake tomorrow?' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(within(panel).getByText(DEMO_ASK_OWN)).toBeTruthy(), { timeout: 3000 });
  });
});

describe('the Try the AI features card', () => {
  it('opens each feature', () => {
    const actions = { order: vi.fn(), bake: vi.fn(), recipe: vi.fn(), promote: vi.fn(), ask: vi.fn(), briefing: vi.fn() };
    render(<DemoAiCard actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: /Fill an order from a WhatsApp message/ }));
    fireEvent.click(screen.getByRole('button', { name: /Log a bake from a note/ }));
    fireEvent.click(screen.getByRole('button', { name: /Read a handwritten recipe/ }));
    fireEvent.click(screen.getByRole('button', { name: /Turn a photo into a post/ }));
    fireEvent.click(screen.getByRole('button', { name: /Ask about your business/ }));
    fireEvent.click(screen.getByRole('button', { name: /Morning briefing/ }));
    for (const fn of Object.values(actions)) expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('Promote in the demo', () => {
  it('offers the demo photo, with its note, and no styles', () => {
    const promoter: Promoter = { remaining: null, promote: vi.fn(), styling: null };
    render(<PromoteView promoter={promoter} aiBlocked={null} businessName="Demo" example={{ note: DEMO_PROMOTE_NOTE, photo: DEMO_PROMOTE_PHOTO }} />);
    expect(screen.getByRole('button', { name: 'Use the demo photo' })).toBeTruthy();
    expect(screen.getByText(/A photo of the demo kitchen’s croissants is ready/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Choose a photo/ })).toBeTruthy();
  });
});
