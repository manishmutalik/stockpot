// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { aiErrorResponse, getAnthropic, resetAnthropicForTests, workspaceHeaders } from '../anthropic';

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

describe('workspaceHeaders', () => {
  it('names the workspace when one is configured, for a key that is not tied to a workspace', () => {
    expect(workspaceHeaders({ ANTHROPIC_WORKSPACE_ID: 'wrkspc_123' })).toEqual({ 'anthropic-workspace-id': 'wrkspc_123' });
    expect(workspaceHeaders({ ANTHROPIC_WORKSPACE_ID: '  wrkspc_123 \n' })).toEqual({ 'anthropic-workspace-id': 'wrkspc_123' });
  });

  it('adds nothing when it is not set or is blank', () => {
    expect(workspaceHeaders({})).toBeUndefined();
    expect(workspaceHeaders({ ANTHROPIC_WORKSPACE_ID: '   ' })).toBeUndefined();
  });

  it('is sent on the requests the server makes, and not sent when unset', async () => {
    const seen: Headers[] = [];
    const fakeFetch = vi.fn(async (_url: any, init: any) => {
      seen.push(new Headers(init.headers));
      return new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'x', content: [], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fakeFetch);
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const ask = () => getAnthropic().messages.create({ model: 'claude-haiku-4-5', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] });
    try {
      process.env.ANTHROPIC_WORKSPACE_ID = 'wrkspc_abc';
      resetAnthropicForTests();
      await ask();
      expect(seen[0].get('anthropic-workspace-id')).toBe('wrkspc_abc');
      delete process.env.ANTHROPIC_WORKSPACE_ID;
      resetAnthropicForTests();
      await ask();
      expect(seen[1].get('anthropic-workspace-id')).toBeNull();
    } finally {
      delete process.env.ANTHROPIC_WORKSPACE_ID;
      vi.unstubAllGlobals();
      resetAnthropicForTests();
    }
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
