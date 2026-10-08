import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OnlinePaymentsCard } from '../OnlinePaymentsCard';
import { apiFetch } from '../../utils/apiClient';

vi.mock('../../utils/apiClient', () => ({ apiFetch: vi.fn() }));
const api = vi.mocked(apiFetch);

const reply = (data: unknown, ok = true) => ({ ok, json: async () => data }) as any;
const SECRET = 'my-very-secret-value-ABCD';
const saved = { serverReady: true, configured: true, provider: 'razorpay', keyId: 'rzp_test_AbC123', secretLast4: 'ABCD', test: true, updatedAt: 1 };

/** Answers each call by method and path; anything not listed fails the test. */
const serve = (routes: Record<string, any | (() => any)>) => api.mockImplementation(async (url: any, init: any = {}) => {
  const key = `${(init.method ?? 'GET')} ${url}`;
  const hit = routes[key];
  if (hit === undefined) throw new Error(`unexpected call: ${key}`);
  return typeof hit === 'function' ? hit(init) : hit;
});

const fillRazorpay = () => {
  fireEvent.change(screen.getByLabelText('Key ID'), { target: { value: 'rzp_test_AbC123' } });
  fireEvent.change(screen.getByLabelText('Key Secret'), { target: { value: SECRET } });
};

beforeEach(() => { api.mockReset(); });

describe('OnlinePaymentsCard', () => {
  it('starts with nothing set up: a choice of gateway and the keys form', async () => {
    serve({ 'GET /api/payments/gateway': reply({ serverReady: true, configured: false }) });
    render(<OnlinePaymentsCard />);
    expect(await screen.findByRole('radiogroup', { name: 'Payment gateway' })).toBeTruthy();
    expect(screen.getByText('Off')).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Razorpay/ }).getAttribute('aria-checked')).toBe('true');
    expect((screen.getByLabelText('Key Secret') as HTMLInputElement).type).toBe('password');
    fireEvent.click(screen.getByRole('radio', { name: /Cashfree/ }));
    expect(screen.getByLabelText('App ID')).toBeTruthy();
    expect(screen.getByLabelText('These keys are for')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /Another gateway/ }));
    expect(screen.getByLabelText('Payment link')).toBeTruthy();
  });

  it('checks the form before sending anything, and says what is wrong', async () => {
    serve({ 'GET /api/payments/gateway': reply({ serverReady: true, configured: false }) });
    render(<OnlinePaymentsCard />);
    await screen.findByRole('radiogroup');
    fireEvent.click(screen.getByRole('button', { name: 'Save and check keys' }));
    expect(screen.getByRole('alert').textContent).toBe('Enter your Key ID.');
    expect(api).toHaveBeenCalledTimes(1); // only the first load
  });

  it('saves the keys, then shows only which gateway and the last four characters, with the secret gone from the screen', async () => {
    let sent: any;
    serve({
      'GET /api/payments/gateway': reply({ serverReady: true, configured: false }),
      'PUT /api/payments/gateway': (init: any) => { sent = JSON.parse(init.body); return reply(saved); },
    });
    const { container } = render(<OnlinePaymentsCard />);
    await screen.findByRole('radiogroup');
    fillRazorpay();
    fireEvent.click(screen.getByRole('button', { name: 'Save and check keys' }));
    expect(await screen.findByText('Key Secret: saved, ends ABCD')).toBeTruthy();
    expect(sent).toEqual({ provider: 'razorpay', keyId: 'rzp_test_AbC123', keySecret: SECRET });
    expect(screen.getByRole('status').textContent).toContain('accepted your test keys');
    expect(screen.getByText('Test mode')).toBeTruthy();
    expect(screen.getByText(/nothing a customer pays is real money/)).toBeTruthy();
    expect(container.innerHTML).not.toContain(SECRET);
    expect(screen.queryByLabelText('Key Secret')).toBeNull();
  });

  it('shows the server\'s own words when the gateway does not accept the keys, and keeps the form for another try', async () => {
    serve({
      'GET /api/payments/gateway': reply({ serverReady: true, configured: false }),
      'PUT /api/payments/gateway': reply({ error: 'Razorpay did not accept those keys. Check the Key ID and Key Secret.', code: 'gateway_rejected' }, false),
    });
    render(<OnlinePaymentsCard />);
    await screen.findByRole('radiogroup');
    fillRazorpay();
    fireEvent.click(screen.getByRole('button', { name: 'Save and check keys' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Razorpay did not accept those keys');
    expect((screen.getByLabelText('Key ID') as HTMLInputElement).value).toBe('rzp_test_AbC123');
  });

  it('cannot keep keys on a server with no encryption key, but still takes a payment link', async () => {
    let sent: any;
    serve({
      'GET /api/payments/gateway': reply({ serverReady: false, configured: false }),
      'PUT /api/payments/gateway': (init: any) => { sent = JSON.parse(init.body); return reply({ serverReady: false, configured: true, provider: 'link', link: 'https://rzp.io/l/anita' }); },
    });
    render(<OnlinePaymentsCard />);
    await screen.findByRole('radiogroup');
    expect(screen.getByRole('alert').textContent).toContain('PAYMENT_SECRETS_KEY');
    expect((screen.getByRole('button', { name: 'Save and check keys' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /Another gateway/ }));
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.change(screen.getByLabelText('Payment link'), { target: { value: 'https://rzp.io/l/anita' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save link' }));
    expect(await screen.findByText('https://rzp.io/l/anita')).toBeTruthy();
    expect(sent).toEqual({ provider: 'link', link: 'https://rzp.io/l/anita' });
    expect(screen.getByText('Payment link')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Test connection' })).toBeNull(); // a pasted link has nothing to test
  });

  it('tests a saved connection, in words either way', async () => {
    let ok = true;
    serve({
      'GET /api/payments/gateway': reply(saved),
      'POST /api/payments/gateway/test': () => reply(ok ? { ok: true, test: true } : { ok: false, message: 'Razorpay did not accept those keys.' }),
    });
    render(<OnlinePaymentsCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Test connection' }));
    expect((await screen.findByRole('status')).textContent).toBe('The gateway accepted your keys.');
    ok = false;
    fireEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Razorpay did not accept those keys.');
  });

  it('replaces keys through the same form, and cancelling leaves the saved setup alone', async () => {
    serve({ 'GET /api/payments/gateway': reply(saved) });
    render(<OnlinePaymentsCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Replace keys' }));
    expect(screen.getByLabelText('Key Secret')).toBeTruthy();
    expect((screen.getByLabelText('Key ID') as HTMLInputElement).value).toBe(''); // the old secret is never filled back in
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Key Secret: saved, ends ABCD')).toBeTruthy();
  });

  it('asks before removing, then removes it', async () => {
    serve({
      'GET /api/payments/gateway': reply(saved),
      'DELETE /api/payments/gateway': reply({ serverReady: true, configured: false }),
    });
    render(<OnlinePaymentsCard />);
    fireEvent.click(await screen.findByRole('button', { name: /Remove/ }));
    expect(screen.getByText(/Customers will no longer see the card button/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(api).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Remove/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));
    await waitFor(() => expect(screen.getByRole('radiogroup')).toBeTruthy());
    expect(screen.getByText('Off')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Removed');
  });

  it('says so, with a way to retry, when the settings cannot be loaded', async () => {
    api.mockRejectedValueOnce(new Error('offline'));
    render(<OnlinePaymentsCard />);
    expect((await screen.findByRole('alert')).textContent).toContain('Could not load your online payment settings.');
    serve({ 'GET /api/payments/gateway': reply({ serverReady: true, configured: false }) });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('radiogroup')).toBeTruthy();
  });
});
