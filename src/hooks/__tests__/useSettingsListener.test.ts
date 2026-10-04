import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

let onNext: (snap: any) => void = () => {};
let onError: (err: any) => void = () => {};
const unsubscribe = vi.fn();
vi.mock('../../firebase', () => ({
  auth: { currentUser: { uid: 'user1' } },
  db: {},
  doc: vi.fn((...args: any[]) => ({ path: args.slice(1).join('/') })),
  onSnapshot: vi.fn((_ref: any, next: any, error: any) => { onNext = next; onError = error; return unsubscribe; }),
}));
vi.mock('../../utils/firestoreError', () => ({ handleFirestoreError: vi.fn(), OperationType: { GET: 'get' } }));

import { useSettingsListener } from '../useSettingsListener';

const snap = (data: any | null, pending = false) => ({ metadata: { hasPendingWrites: pending }, exists: () => data !== null, data: () => data });
const user: any = { uid: 'user1' };

beforeEach(() => { vi.clearAllMocks(); });

describe('useSettingsListener', () => {
  it('starts with the defaults and is not "loaded" until the stored settings are read', () => {
    const { result } = renderHook(() => useSettingsListener(true, user));
    expect(result.current.settings.name).toBe('My Food Business');
    expect(result.current.settingsLoaded).toBe(false);
  });

  it('is loaded, with the stored values, once they arrive', () => {
    const { result } = renderHook(() => useSettingsListener(true, user));
    act(() => onNext(snap({ name: 'Asha Bakes', phone: '+91 98450 10101', upiId: 'asha@upi' })));
    expect(result.current.settingsLoaded).toBe(true);
    expect(result.current.settings).toMatchObject({ name: 'Asha Bakes', phone: '+91 98450 10101', upiId: 'asha@upi' });
  });

  it('is loaded, still on the defaults, for an account with no settings yet', () => {
    const { result } = renderHook(() => useSettingsListener(true, user));
    act(() => onNext(snap(null)));
    expect(result.current.settingsLoaded).toBe(true);
    expect(result.current.settings.name).toBe('My Food Business');
  });

  it('is not loaded if the read fails, so the defaults are never mistaken for the stored settings', () => {
    const { result } = renderHook(() => useSettingsListener(true, user));
    act(() => onError(new Error('permission-denied')));
    expect(result.current.settingsLoaded).toBe(false);
  });

  it('ignores a local write that is still pending', () => {
    const { result } = renderHook(() => useSettingsListener(true, user));
    act(() => onNext(snap({ name: 'Pending' }, true)));
    expect(result.current.settingsLoaded).toBe(false);
    expect(result.current.settings.name).toBe('My Food Business');
  });

  it('is not loaded again for a different sign-in until that account\'s settings arrive', () => {
    const { result, rerender } = renderHook(({ u }) => useSettingsListener(true, u), { initialProps: { u: user } });
    act(() => onNext(snap({ name: 'Asha Bakes' })));
    expect(result.current.settingsLoaded).toBe(true);
    rerender({ u: { uid: 'user2' } as any });
    expect(result.current.settingsLoaded).toBe(false);
    expect(unsubscribe).toHaveBeenCalled();
    act(() => onNext(snap({ name: 'Other Cafe' })));
    expect(result.current.settingsLoaded).toBe(true);
  });

  it('does not subscribe before sign-in is ready', () => {
    const { result } = renderHook(() => useSettingsListener(false, user));
    expect(result.current.settingsLoaded).toBe(false);
  });
});
