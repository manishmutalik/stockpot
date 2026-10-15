/**
 * useAiBlocked.ts
 *
 * Asks the server once, when signed in and the data has loaded, whether AI is available to this account, and if it
 * is not, what to tell the owner about it (utils/aiAccess). The AI features themselves ask on their own; this only
 * supplies the reason they show when they are not available. Null while asking, when AI is available, when the
 * server cannot be reached, and when there is nothing the owner can do.
 */
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../utils/apiClient';
import { aiBlockedMessage } from '../utils/aiAccess';

export function useAiBlocked(input: { signedIn: boolean; dataReady: boolean; unverified: boolean }): string | null {
  const [reason, setReason] = useState<string | null>(null);
  const asked = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    if (!input.signedIn || !input.dataReady || asked.current) return;
    asked.current = true;
    (async () => {
      try {
        const res = await apiFetch('/api/ai/status');
        if (!res.ok) return;
        const status = await res.json();
        if (alive.current && status.available === false && typeof status.reason === 'string') setReason(status.reason);
      } catch {
        // Not reachable: the features simply do not appear.
      }
    })();
  }, [input.signedIn, input.dataReady]);

  return aiBlockedMessage(reason, { unverified: input.unverified });
}
