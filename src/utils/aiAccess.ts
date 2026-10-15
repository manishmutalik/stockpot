/**
 * aiAccess.ts
 *
 * Why AI is not available to this account, in words the owner can act on. The server's AI status gives a reason
 * (lib/aiRoutes); the app shows the AI features with that reason instead of hiding them, but only where the owner
 * can do something about it: verify their email, take a plan, or sign up from the demo. Where they cannot (the
 * server has no AI, or AI is not on for this account yet) the features stay hidden.
 */

/** The reasons GET /api/ai/status gives when AI is not available. */
export type AiBlockedReason = 'unavailable' | 'demo_account' | 'not_allowed' | 'subscription_required';

/** The demo kitchen's made-up sign-in (as lib/aiConfig recognises it): it has no inbox to verify. */
export const isDemoEmail = (email: string | null | undefined): boolean => !!email && /^demo_\d+_\d+@bettereat\.com$/i.test(email);

/** Whether this account signed in with an email and password whose address has not been verified yet. */
export function needsEmailVerification(user: { email?: string | null; emailVerified?: boolean; usesPassword?: boolean } | null | undefined): boolean {
  return !!user && user.usesPassword === true && user.emailVerified === false && !!user.email && !isDemoEmail(user.email);
}

/** What to tell the owner when an AI feature is pressed but AI is not available; null keeps the feature hidden. */
export function aiBlockedMessage(reason: string | null | undefined, who: { unverified: boolean }): string | null {
  switch (reason) {
    case 'demo_account':
      return 'AI features are not available in the demo kitchen. Create your own account to use them.';
    case 'not_allowed':
      // An unverified email does not count towards access; verifying is the step the owner can take.
      return who.unverified ? 'Verify your email to use AI features. Go to Settings › User Account to send the verification email.' : null;
    case 'subscription_required':
      return 'AI features need an active plan. Start one in Settings › User Account.';
    default:
      return null;
  }
}
