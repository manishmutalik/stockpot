import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthScreen, LoadingScreen, PaywallScreen } from '../AuthScreens';

function setup(over: Record<string, any> = {}) {
  const props = {
    mode: 'google', onModeChange: vi.fn(),
    displayName: '', onDisplayNameChange: vi.fn(), email: '', onEmailChange: vi.fn(),
    password: '', onPasswordChange: vi.fn(), error: null, onClearError: vi.fn(),
    isAuthenticating: false, isDemoLoading: false,
    onGoogle: vi.fn(), onEmailSubmit: vi.fn((e: any) => e.preventDefault()), onDemo: vi.fn(),
    ...over,
  };
  render(<AuthScreen {...props as any} />);
  return props;
}

describe('AuthScreen', () => {
  it('offers Google, email and the demo sandbox', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: /Sign in with Google/ }));
    expect(props.onGoogle).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Sign in with Email/ }));
    expect(props.onModeChange).toHaveBeenCalledWith('login');
    fireEvent.click(screen.getByRole('button', { name: /Explore Demo Sandbox/ }));
    expect(props.onDemo).toHaveBeenCalled();
  });

  it('disables the demo button while working and says so', () => {
    setup({ isDemoLoading: true });
    const btn = screen.getByRole('button', { name: /Generating Demo Sandbox/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('shows an error banner', () => {
    setup({ error: 'Google login failed. Please try again.' });
    expect(screen.getByRole('alert').textContent).toBe('Google login failed. Please try again.');
  });

  it('login mode has email and password, submits, and toggles to sign-up', () => {
    const props = setup({ mode: 'login' });
    expect(screen.queryByLabelText('Full Name')).toBeNull();
    fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'a@b.co' } });
    expect(props.onEmailChange).toHaveBeenCalledWith('a@b.co');
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret1' } });
    expect(props.onPasswordChange).toHaveBeenCalledWith('secret1');
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    fireEvent.click(screen.getByRole('button', { name: /Don't have an account/ }));
    expect(props.onModeChange).toHaveBeenCalledWith('signup');
  });

  it('sign-up mode asks for a name and offers to go back to sign-in', () => {
    const props = setup({ mode: 'signup' });
    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Asha' } });
    expect(props.onDisplayNameChange).toHaveBeenCalledWith('Asha');
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Already have an account/ }));
    expect(props.onModeChange).toHaveBeenCalledWith('login');
  });

  it('"Back to options" returns to the choices and clears the error', () => {
    const props = setup({ mode: 'login', error: 'Invalid email or password.' });
    fireEvent.click(screen.getByRole('button', { name: /Back to options/ }));
    expect(props.onModeChange).toHaveBeenCalledWith('google');
    expect(props.onClearError).toHaveBeenCalled();
  });

  it('shows Processing while signing in', () => {
    setup({ mode: 'login', isAuthenticating: true });
    expect((screen.getByRole('button', { name: 'Processing...' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('PaywallScreen', () => {
  it('invites a new user to start a trial', () => {
    const onContinue = vi.fn(); const onSignOut = vi.fn();
    render(<PaywallScreen needsAttention={false} isBusy={false} onContinue={onContinue} onSignOut={onSignOut} />);
    expect(screen.getByText('Start your free trial')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start Free Trial' }));
    expect(onContinue).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalled();
  });

  it('asks a lapsed subscriber to update billing', () => {
    render(<PaywallScreen needsAttention isBusy={false} onContinue={vi.fn()} onSignOut={vi.fn()} />);
    expect(screen.getByText('Subscription needs attention')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Update Billing' })).toBeTruthy();
  });

  it('shows Redirecting while busy', () => {
    render(<PaywallScreen needsAttention={false} isBusy onContinue={vi.fn()} onSignOut={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Redirecting…' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('LoadingScreen', () => {
  it('shows a status message', () => {
    render(<LoadingScreen message="Checking your plan..." />);
    expect(screen.getByRole('status').textContent).toContain('Checking your plan...');
  });
});
