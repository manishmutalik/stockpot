/**
 * readingLabel.ts
 *
 * What the capture screen says while the server reads a message. The wait is a model call followed by the server checking
 * every figure against what was said, so the words follow that, and say so when it is taking longer than usual, instead
 * of a spinner that gives no sign it is alive.
 */
import { useEffect, useState } from 'react';

export const READING_CHECKING_AFTER_MS = 3000;
export const READING_LONG_AFTER_MS = 9000;

export function readingLabel(elapsedMs: number): string {
  if (elapsedMs < READING_CHECKING_AFTER_MS) return 'Reading what you wrote…';
  if (elapsedMs < READING_LONG_AFTER_MS) return 'Checking the numbers…';
  return 'Still working, nearly there…';
}

/** The label for how long `active` has been true; starts again each time it becomes true. */
export function useReadingLabel(active: boolean): string {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) { setElapsed(0); return; }
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - start), 500);
    return () => clearInterval(timer);
  }, [active]);
  return readingLabel(elapsed);
}
