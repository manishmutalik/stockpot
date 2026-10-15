import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const apiFetch = vi.fn();
vi.mock('../../utils/apiClient', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));

import { useAiBlocked } from '../useAiBlocked';

const reply = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
type Props = { signedIn: boolean; dataReady: boolean; unverified: boolean };
const props = (over: Partial<Props> = {}): Props => ({ signedIn: true, dataReady: true, unverified: true, ...over });

beforeEach(() => { apiFetch.mockReset(); });

describe('useAiBlocked', () => {
  it('says to verify the email when the server turns an unverified account away', async () => {
    apiFetch.mockImplementation(() => reply(200, { available: false, reason: 'not_allowed' }));
    const { result } = renderHook(() => useAiBlocked(props()));
    await waitFor(() => expect(result.current).toMatch(/^Verify your email/));
    expect(apiFetch).toHaveBeenCalledWith('/api/ai/status');
  });

  it('is null when AI is available, and asks only once', async () => {
    apiFetch.mockImplementation(() => reply(200, { available: true, limits: {} }));
    const { result, rerender } = renderHook((p: Props) => useAiBlocked(p), { initialProps: props() });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    rerender(props({ unverified: false }));
    await act(async () => {});
    expect(result.current).toBeNull();
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('asks nothing until signed in and the data has loaded, and stays quiet if the server cannot be reached', async () => {
    const { result, rerender } = renderHook((p: Props) => useAiBlocked(p), { initialProps: props({ dataReady: false }) });
    expect(apiFetch).not.toHaveBeenCalled();
    apiFetch.mockImplementation(() => { throw new Error('offline'); });
    rerender(props());
    await act(async () => {});
    expect(result.current).toBeNull();
  });
});
