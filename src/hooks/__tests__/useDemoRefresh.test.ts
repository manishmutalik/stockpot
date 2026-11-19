import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const apiFetch = vi.fn();
vi.mock('../../utils/apiClient', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));

import { useDemoRefresh } from '../useDemoRefresh';
import { todayInZone } from '../../utils/localDate';

const today = todayInZone(undefined);
const stale = { demoSeededOn: '2026-01-01', email: 'u1@demo.stockpot.app', name: 'Stockpot Demo Kitchen' };
const fresh = { ...stale, demoSeededOn: today };

beforeEach(() => { apiFetch.mockReset(); apiFetch.mockResolvedValue({ ok: true, status: 200 }); });

describe('useDemoRefresh', () => {
  it('asks the server to set a stale demo kitchen up afresh, once', () => {
    const { rerender } = renderHook(props => useDemoRefresh(props), { initialProps: { isDemo: true, settingsLoaded: true, userId: 'u1', settings: stale } });
    expect(apiFetch).toHaveBeenCalledWith('/api/demo/seed', { method: 'POST' });
    rerender({ isDemo: true, settingsLoaded: true, userId: 'u1', settings: { ...stale } });
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('leaves today’s demo kitchen, and never asks for a real account or before the settings are in', () => {
    renderHook(() => useDemoRefresh({ isDemo: true, settingsLoaded: true, userId: 'u1', settings: fresh }));
    renderHook(() => useDemoRefresh({ isDemo: false, settingsLoaded: true, userId: 'u1', settings: stale }));
    renderHook(() => useDemoRefresh({ isDemo: true, settingsLoaded: false, userId: 'u1', settings: stale }));
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
