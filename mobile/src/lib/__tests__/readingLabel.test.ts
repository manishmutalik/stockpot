import { describe, it, expect } from 'vitest';
import { READING_CHECKING_AFTER_MS, READING_LONG_AFTER_MS, readingLabel } from '../readingLabel';

describe('readingLabel', () => {
  it('starts with reading, moves to checking, and says so when it is taking long', () => {
    expect(readingLabel(0)).toBe('Reading what you wrote…');
    expect(readingLabel(READING_CHECKING_AFTER_MS - 1)).toBe('Reading what you wrote…');
    expect(readingLabel(READING_CHECKING_AFTER_MS)).toBe('Checking the numbers…');
    expect(readingLabel(READING_LONG_AFTER_MS - 1)).toBe('Checking the numbers…');
    expect(readingLabel(READING_LONG_AFTER_MS)).toBe('Still working, nearly there…');
    expect(readingLabel(120_000)).toBe('Still working, nearly there…');
  });
});
