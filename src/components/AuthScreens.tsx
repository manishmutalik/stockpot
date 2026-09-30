import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Globe, Loader2, Mail, Sparkles, CreditCard } from 'lucide-react';

export type AuthMode = 'login' | 'signup' | 'google';

const LABEL = 'block font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mb-1.5';
const FIELD =
  'w-full bg-stone-50 border border-transparent rounded-xl px-4 py-3 text-sm text-ink placeholder:text-muted/60 outline-none transition-colors focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary';

/** Teal canvas with a soft glow, holding one centred white card. Shared by every pre-app screen. */
const AuthShell: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className="min-h-screen bg-surface flex items-center justify-center p-4 relative overflow-hidden">
    <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[46rem] h-[46rem] rounded-full bg-primary/10 blur-3xl" />
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative surface-card p-7 sm:p-9 w-full max-w-md ${className}`}
    >
      {children}
    </motion.div>
  </div>
);

/** Shown while Firebase Auth resolves the session on first load. */
export const LoadingScreen: React.FC<{ message?: string }> = ({ message = 'Loading Stockpot...' }) => (
  <div className="min-h-screen bg-surface flex items-center justify-center">
    <div className="flex flex-col items-center gap-4" role="status">
      <img src="/logo-icon.png" alt="Stockpot" className="w-14 h-14" />
      <Loader2 size={28} className="text-primary animate-spin" />
      <p className="font-mono text-[11px] uppercase tracking-wider text-muted">{message}</p>
    </div>
  </div>
);

export interface AuthScreenProps {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  displayName: string;
  onDisplayNameChange: (v: string) => void;
  email: string;
  onEmailChange: (v: string) => void;
  password: string;
  onPasswordChange: (v: string) => void;
  error: string | null;
  onClearError: () => void;
  isAuthenticating: boolean;
  isDemoLoading: boolean;
  onGoogle: () => void;
  onEmailSubmit: (e: React.FormEvent) => void;
  onDemo: () => void;
}

/**
 * Sign-in / sign-up card: Google, email + password (login or sign-up), or the
 * demo sandbox. All auth calls live in App; this only renders the choices.
 */
export const AuthScreen: React.FC<AuthScreenProps> = ({
  mode, onModeChange, displayName, onDisplayNameChange, email, onEmailChange, password, onPasswordChange,
  error, onClearError, isAuthenticating, isDemoLoading, onGoogle, onEmailSubmit, onDemo,
}) => (
  <AuthShell>
    <div className="flex flex-col items-center text-center mb-7">
      <img src="/logo-full.png" alt="Stockpot" className="h-14 w-auto mb-4" />
      <h1 className="text-xl font-bold tracking-tight text-ink">
        {mode === 'signup' ? 'Create your account' : mode === 'login' ? 'Welcome back' : 'Sign in to Stockpot'}
      </h1>
      <p className="text-sm text-muted mt-1">
        {mode === 'google'
          ? 'Manage your inventory, recipes, and margins securely in the cloud.'
          : mode === 'signup'
          ? 'Start tracking stock, orders and margins in minutes.'
          : 'Sign in with your email and password.'}
      </p>
    </div>

    {error && (
      <div role="alert" className="mb-5 p-3 bg-coral/10 text-coral text-sm rounded-xl text-center font-semibold">
        {error}
      </div>
    )}

    {mode === 'google' ? (
      <div className="space-y-3">
        <button
          onClick={onGoogle}
          className="w-full h-12 flex items-center justify-center gap-3 bg-white border border-stone-200 hover:bg-stone-50 text-ink text-sm font-semibold rounded-xl shadow-sm transition-colors"
        >
          <Globe size={18} className="text-primary" />
          Sign in with Google
        </button>
        <button
          onClick={() => onModeChange('login')}
          className="w-full h-12 flex items-center justify-center gap-3 bg-primary hover:bg-primary-dark text-white text-sm font-semibold rounded-xl shadow-md shadow-primary/20 transition-colors"
        >
          <Mail size={18} />
          Sign in with Email
        </button>

        <div className="flex items-center gap-3 py-2" aria-hidden="true">
          <div className="flex-1 h-px bg-stone-100" />
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">or</span>
          <div className="flex-1 h-px bg-stone-100" />
        </div>

        <button
          onClick={onDemo}
          disabled={isAuthenticating || isDemoLoading}
          className="w-full h-12 flex items-center justify-center gap-3 bg-primary/5 hover:bg-primary/10 text-primary text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Sparkles size={18} className={isDemoLoading ? 'animate-spin' : ''} />
          {isDemoLoading ? 'Generating Demo Sandbox...' : 'Explore Demo Sandbox'}
        </button>
      </div>
    ) : (
      <form onSubmit={onEmailSubmit} className="space-y-4">
        {mode === 'signup' && (
          <div>
            <label htmlFor="auth-name" className={LABEL}>Full Name</label>
            <input
              id="auth-name"
              type="text"
              required
              value={displayName}
              onChange={(e) => onDisplayNameChange(e.target.value)}
              className={FIELD}
              placeholder="John Doe"
            />
          </div>
        )}
        <div>
          <label htmlFor="auth-email" className={LABEL}>Email Address</label>
          <input
            id="auth-email"
            type="email"
            required
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            className={FIELD}
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor="auth-password" className={LABEL}>Password</label>
          <input
            id="auth-password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            className={FIELD}
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={isAuthenticating}
          className="w-full h-12 bg-primary hover:bg-primary-dark text-white text-sm font-semibold rounded-xl shadow-md shadow-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isAuthenticating ? 'Processing...' : mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>

        <div className="flex flex-col items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => onModeChange(mode === 'login' ? 'signup' : 'login')}
            className="text-sm text-primary font-semibold hover:underline"
          >
            {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
          <button
            type="button"
            onClick={() => { onModeChange('google'); onClearError(); }}
            className="flex items-center gap-1.5 text-sm text-muted font-medium hover:text-ink"
          >
            <ArrowLeft size={14} />
            Back to options
          </button>
        </div>
      </form>
    )}

    <div className="mt-7 pt-5 border-t border-stone-100 text-center">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">Stockpot</p>
    </div>
  </AuthShell>
);

/** Signed in but without an active or trialing subscription. */
export const PaywallScreen: React.FC<{
  needsAttention: boolean;
  isBusy: boolean;
  onContinue: () => void;
  onSignOut: () => void;
}> = ({ needsAttention, isBusy, onContinue, onSignOut }) => (
  <AuthShell className="text-center">
    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-5 text-primary">
      <CreditCard size={26} />
    </div>
    <h2 className="text-xl font-bold tracking-tight text-ink mb-2">
      {needsAttention ? 'Subscription needs attention' : 'Start your free trial'}
    </h2>
    <p className="text-sm text-muted mb-6">
      {needsAttention
        ? "There's an issue with your payment method, or your subscription has ended. Update your billing details to keep using the app."
        : 'Try Stockpot free for 14 days — inventory, orders, production, and everything else.'}
    </p>
    <button
      onClick={onContinue}
      disabled={isBusy}
      className="w-full h-12 bg-primary hover:bg-primary-dark text-white rounded-xl text-sm font-semibold transition-colors shadow-md shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isBusy ? 'Redirecting…' : needsAttention ? 'Update Billing' : 'Start Free Trial'}
    </button>
    <button onClick={onSignOut} className="w-full mt-3 text-sm text-muted hover:text-ink font-medium">
      Sign out
    </button>
    <p className="mt-6 text-xs text-muted/80">
      By starting your trial you agree to our{' '}
      <a href="/terms" className="underline hover:text-ink">Terms of Service</a>
      {' '}and{' '}
      <a href="/privacy" className="underline hover:text-ink">Privacy Policy</a>.
    </p>
  </AuthShell>
);
