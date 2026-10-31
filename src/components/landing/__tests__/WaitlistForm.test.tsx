import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WaitlistForm } from '../WaitlistForm';

const fill = (fields: Record<string, string>) => {
  for (const [label, value] of Object.entries(fields)) fireEvent.change(screen.getByLabelText(label), { target: { value } });
};
const fetchReturning = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });

afterEach(() => vi.unstubAllGlobals());

describe('WaitlistForm', () => {
  it('says what is missing before sending anything', async () => {
    const fetchMock = fetchReturning(200, { ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<WaitlistForm />);
    fill({ 'Your name': 'Asha', 'WhatsApp number or email': '12345' });
    fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/mobile number or an email/);
    expect(screen.getByLabelText('WhatsApp number or email').getAttribute('aria-invalid')).toBe('true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the details and thanks the visitor', async () => {
    const fetchMock = fetchReturning(200, { ok: true, created: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<WaitlistForm />);
    fill({ 'Your name': 'Asha Rao', 'WhatsApp number or email': '98765 43210', 'City (optional)': 'Pune' });
    fireEvent.change(screen.getByLabelText(/Your business/), { target: { value: 'Tiffin service' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }));
    expect((await screen.findByRole('status')).textContent).toContain("You're on the list.");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/waitlist');
    expect(JSON.parse(init.body)).toEqual({ name: 'Asha Rao', contact: '98765 43210', business: 'Tiffin service', city: 'Pune', website: '' });
  });

  it('shows what the server said when it refuses', async () => {
    vi.stubGlobal('fetch', fetchReturning(429, { error: 'Too many tries from here. Please try again in a little while.' }));
    render(<WaitlistForm />);
    fill({ 'Your name': 'Asha', 'WhatsApp number or email': 'asha@example.com' });
    fireEvent.click(screen.getByRole('button', { name: 'Join the waitlist' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Too many tries/);
  });
});
