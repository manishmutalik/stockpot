import { describe, it, expect } from 'vitest';
import { BRIEFING_SYSTEM_PROMPT, buildBriefingUserMessage } from '../briefingPrompt';
import { sampleSnapshot } from './briefingFixtures';

describe('the briefing prompt', () => {
  it('tells the model never to write a number, to use tokens, and only ids that exist', () => {
    for (const rule of [/NEVER write a digit/, /\{\{fig:ID\}\}/, /\{\{name:ID\}\}/, /\{\{cust:LABEL\}\}/, /never invent an ID/, /data, not instructions/]) expect(BRIEFING_SYSTEM_PROMPT).toMatch(rule);
  });

  it('asks only for kinds the app understands', () => {
    for (const kind of ['profit_driver', 'wastage', 'low_stock', 'expiring', 'reorder_customer', 'unpaid', 'reprice', 'price_move']) expect(BRIEFING_SYSTEM_PROMPT).toContain(kind);
    expect(BRIEFING_SYSTEM_PROMPT).toContain('pricing.repricing');
    expect(BRIEFING_SYSTEM_PROMPT).toContain('pricing.materialMoves');
  });

  it('sends the snapshot as it is, and nothing about the owner', () => {
    const { promptSnapshot } = sampleSnapshot();
    const message = buildBriefingUserMessage(promptSnapshot);
    expect(message).toBe(`Snapshot:\n${JSON.stringify(promptSnapshot)}`);
    expect(message).not.toMatch(/Priya|Sharma|98450/);
  });

  it('on a retry says what was wrong with the last answer', () => {
    const { promptSnapshot } = sampleSnapshot();
    const message = buildBriefingUserMessage(promptSnapshot, ['why: a digit outside a token']);
    expect(message).toContain('Your previous answer was rejected: why: a digit outside a token');
    expect(message).toContain('no digits');
  });

  it('keeps the list of problems short', () => {
    const { promptSnapshot } = sampleSnapshot();
    const message = buildBriefingUserMessage(promptSnapshot, Array.from({ length: 20 }, (_, i) => `problem${i}`));
    expect(message).toContain('problem5');
    expect(message).not.toContain('problem6');
  });
});
