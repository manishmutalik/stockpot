import React from 'react';
import { DEMO_WAITLIST_LINK } from '../utils/demoAi';

/**
 * The note above an AI feature's example in the demo kitchen (utils/demoAi): what the example is, that an owner's own
 * account works on their own things, a link to the waitlist, and, once the visitor has changed the example, a way to
 * put it back.
 */
export const DemoExampleNote: React.FC<{ note: string; onPutBack?: (() => void) | null; className?: string }> = ({ note, onPutBack, className = '' }) => (
  <div data-demo-example className={`rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 leading-relaxed ${className}`}>
    <span className="font-bold">Demo example.</span> {note}{' '}
    <a href={DEMO_WAITLIST_LINK} className="font-semibold text-primary hover:underline whitespace-nowrap">Join the waitlist</a>
    {onPutBack && (
      <>
        {' · '}
        <button type="button" onClick={onPutBack} className="font-semibold text-primary hover:underline whitespace-nowrap">Put the example back</button>
      </>
    )}
  </div>
);
