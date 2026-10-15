import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// The real App against the in-memory Firebase (fakeFirebase.ts): signing up with an email and password.
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof import('./fakeFirebase').createFakeFirebase> | null }));
vi.mock('../firebase', async () => {
  const { createFakeFirebase } = await import('./fakeFirebase');
  fake.current = createFakeFirebase();
  return fake.current.module;
});

import App from '../App';

beforeEach(() => {
  fake.current!.reset();
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('signing up with an email and password', () => {
  it('sends the email that verifies the address', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with Email' }));
    fireEvent.click(screen.getByRole('button', { name: /Sign up/ }));
    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Asha' } });
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'asha@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-long-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
    await waitFor(() => expect(fake.current!.calls.verificationSentTo).toEqual(['asha@example.com']));
  });

  it('never sends one to the demo kitchen', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /Explore Demo Sandbox/ }));
    await waitFor(() => expect(fake.current!.auth.currentUser).not.toBeNull());
    expect(fake.current!.calls.verificationSentTo).toEqual([]);
  });
});
