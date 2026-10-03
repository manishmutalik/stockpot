// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { aiErrorResponse, getAnthropic, resetAnthropicForTests } from '../anthropic';

describe('getAnthropic', () => {
  const saved = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => resetAnthropicForTests());
  afterEach(() => { if (saved === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved; resetAnthropicForTests(); });

  it('refuses, with a clear message, when there is no key, instead of failing at start-up', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => getAnthropic()).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('makes one client and reuses it', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    expect(getAnthropic()).toBe(getAnthropic());
  });
});

describe('aiErrorResponse', () => {
  const err = (status?: number, name = 'Error') => Object.assign(new Error('provider detail: request id req_123, key sk-ant-secret'), { status, name });

  it('maps provider failures to something an owner can act on', () => {
    expect(aiErrorResponse(err(429))).toMatchObject({ status: 503, message: expect.stringMatching(/busy/) });
    expect(aiErrorResponse(err(529))).toMatchObject({ status: 503, message: expect.stringMatching(/overloaded/) });
    expect(aiErrorResponse(err(503))).toMatchObject({ status: 503 });
    expect(aiErrorResponse(err(401))).toMatchObject({ status: 500, message: expect.stringMatching(/not set up correctly/) });
    expect(aiErrorResponse(err(403))).toMatchObject({ status: 500 });
    expect(aiErrorResponse(err(402))).toMatchObject({ status: 503, message: expect.stringMatching(/paused/) });
    expect(aiErrorResponse(err(undefined, 'APIConnectionTimeoutError'))).toMatchObject({ status: 504 });
    expect(aiErrorResponse(err(500))).toMatchObject({ status: 502 });
    expect(aiErrorResponse(new Error('boom'))).toMatchObject({ status: 502 });
    expect(aiErrorResponse('weird')).toMatchObject({ status: 502 });
    expect(aiErrorResponse(null)).toMatchObject({ status: 502 });
  });

  it('never forwards the provider\'s own message', () => {
    for (const status of [400, 401, 402, 429, 500, 529]) expect(JSON.stringify(aiErrorResponse(err(status)))).not.toMatch(/req_123|sk-ant|provider detail/);
  });
});
