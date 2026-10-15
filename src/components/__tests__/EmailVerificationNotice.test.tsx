import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EmailVerificationNotice, type VerificationSent } from '../EmailVerificationNotice';

const renderNotice = (over: { onSend?: () => Promise<VerificationSent>; onCheck?: () => Promise<boolean> } = {}) => {
  const onSend = vi.fn(over.onSend ?? (async (): Promise<VerificationSent> => ({ ok: true })));
  const onCheck = vi.fn(over.onCheck ?? (async () => false));
  render(<EmailVerificationNotice email="asha@example.com" onSend={onSend} onCheck={onCheck} />);
  return { onSend, onCheck };
};
const status = () => screen.getByRole('status').textContent;

describe('EmailVerificationNotice', () => {
  it('says the email is not verified and sends the verification email', async () => {
    const { onSend } = renderNotice();
    expect(screen.getByText("Your email isn't verified")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send verification email' }));
    await waitFor(() => expect(status()).toContain('Sent to asha@example.com'));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('says what went wrong when it could not be sent', async () => {
    renderNotice({ onSend: async () => ({ ok: false, message: 'An email was sent a moment ago.' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Send verification email' }));
    await waitFor(() => expect(status()).toBe('An email was sent a moment ago.'));
  });

  it('checks, and says so when the link has not been opened yet', async () => {
    const { onCheck } = renderNotice();
    fireEvent.click(screen.getByRole('button', { name: "I've verified it" }));
    await waitFor(() => expect(status()).toMatch(/^Not verified yet/));
    expect(onCheck).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: "I've verified it" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('once verified, waits for the app to refresh', async () => {
    renderNotice({ onCheck: async () => true });
    fireEvent.click(screen.getByRole('button', { name: "I've verified it" }));
    await waitFor(() => expect(status()).toBe('Verified. Refreshing…'));
    expect((screen.getByRole('button', { name: 'Checking…' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('says so when the check itself fails', async () => {
    renderNotice({ onCheck: async () => { throw new Error('offline'); } });
    fireEvent.click(screen.getByRole('button', { name: "I've verified it" }));
    await waitFor(() => expect(status()).toMatch(/^Could not check just now/));
  });
});
