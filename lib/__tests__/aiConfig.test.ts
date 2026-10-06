import { describe, it, expect } from 'vitest';
import { AI_MODEL, DEFAULT_GLOBAL_LIMIT, DEFAULT_LIMITS, isDemoAccountEmail, parseLimit, readAiConfig } from '../aiConfig';

describe('readAiConfig', () => {
  it('is off by default, with nothing allowed through and the documented limits', () => {
    const c = readAiConfig({});
    expect(c.enabled).toBe(false);
    expect(c.keyConfigured).toBe(false);
    expect(c.allowedEmails).toEqual([]);
    expect(c.allowedUids).toEqual([]);
    expect(c.limits).toEqual({ chat: 30, briefing: 4, parse: 30, quick: 60 });
    expect(c.globalLimit).toBe(1500);
    expect(DEFAULT_LIMITS.chat).toBe(30);
    expect(DEFAULT_GLOBAL_LIMIT).toBe(1500);
  });

  it('is on only for exactly "true"', () => {
    for (const v of ['TRUE', '1', 'yes', 'on', ' true', '']) expect(readAiConfig({ AI_FEATURES_ENABLED: v }).enabled, v).toBe(false);
    expect(readAiConfig({ AI_FEATURES_ENABLED: 'true' }).enabled).toBe(true);
  });

  it('needs a real key', () => {
    expect(readAiConfig({ ANTHROPIC_API_KEY: 'sk-ant-x' }).keyConfigured).toBe(true);
    expect(readAiConfig({ ANTHROPIC_API_KEY: '   ' }).keyConfigured).toBe(false);
    expect(readAiConfig({ ANTHROPIC_API_KEY: '' }).keyConfigured).toBe(false);
  });

  it('reads the chat cap from the server environment', () => {
    expect(readAiConfig({ AI_CHAT_DAILY_LIMIT: '50' }).limits.chat).toBe(50);
    expect(readAiConfig({ AI_CHAT_DAILY_LIMIT: '0' }).limits.chat).toBe(0);
  });

  it('reads the other limits', () => {
    const c = readAiConfig({ AI_BRIEFING_DAILY_LIMIT: '2', AI_PARSE_DAILY_LIMIT: '5', AI_GLOBAL_DAILY_LIMIT: '200' });
    expect(c.limits).toMatchObject({ briefing: 2, parse: 5 });
    expect(c.globalLimit).toBe(200);
  });

  it('gives the phone app its own limit, 60 a day unless set', () => {
    expect(readAiConfig({}).limits.quick).toBe(60);
    expect(readAiConfig({ AI_QUICK_DAILY_LIMIT: '25' }).limits).toMatchObject({ quick: 25, parse: 30 });
  });

  it('reads allow-lists, trimming, lower-casing emails and ignoring blanks', () => {
    const c = readAiConfig({ AI_ALLOWED_EMAILS: ' Owner@Example.com , ,b@x.com', AI_ALLOWED_UIDS: 'uid1, uid2 ,' });
    expect(c.allowedEmails).toEqual(['owner@example.com', 'b@x.com']);
    expect(c.allowedUids).toEqual(['uid1', 'uid2']);
  });

  it('uses Claude Haiku 4.5', () => {
    expect(AI_MODEL).toBe('claude-haiku-4-5');
  });
});

describe('parseLimit', () => {
  it('takes a whole number, including 0', () => {
    expect(parseLimit('30', 5)).toBe(30);
    expect(parseLimit(' 12 ', 5)).toBe(12);
    expect(parseLimit('0', 5)).toBe(0);
  });

  it('falls back to the default for anything else, so a typo cannot open the cap or break the server', () => {
    for (const bad of [undefined, '', '  ', '-1', '1.5', 'many', '10x', 'Infinity', '1e3', 'NaN']) expect(parseLimit(bad, 7), String(bad)).toBe(7);
  });

  it('caps an absurd value', () => {
    expect(parseLimit('99999999999', 5)).toBe(100000);
  });
});

describe('isDemoAccountEmail', () => {
  it('recognises the emails the demo sign-in creates', () => {
    expect(isDemoAccountEmail('demo_1790918984956_4821@bettereat.com')).toBe(true);
    expect(isDemoAccountEmail('DEMO_1_2@BETTEREAT.COM')).toBe(true);
  });

  it('does not catch real accounts', () => {
    for (const e of ['asha@bettereat.com', 'demo@bettereat.com', 'demo_1_2@gmail.com', 'xdemo_1_2@bettereat.com', 'demo_1_2@bettereat.com.evil.com', 'demo_a_b@bettereat.com', '', undefined, null]) {
      expect(isDemoAccountEmail(e as any), String(e)).toBe(false);
    }
  });
});
