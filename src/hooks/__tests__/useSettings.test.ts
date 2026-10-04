import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const setDoc = vi.fn();
vi.mock('../../firebase', () => ({
  auth: { currentUser: { uid: 'user1' } },
  db: {},
  doc: vi.fn((...args: any[]) => ({ path: args.slice(1).join('/') })),
  setDoc: (...a: any[]) => setDoc(...a),
}));

import { useSettings } from '../useSettings';
import type { BakerySettings } from '../../types';

const DEFAULTS = { name: 'My Food Business', phone: '', upiId: '', gstApplicable: false, fixedCosts: [] } as unknown as BakerySettings;
const STORED = { name: 'Asha Bakes', phone: '+91 98450 10101', upiId: 'asha@upi', gstApplicable: true, fixedCosts: [{ id: 'rent', name: 'Rent', amount: 20000 }] } as unknown as BakerySettings;

const mount = (initial: { settings: BakerySettings; settingsLoaded: boolean; isAuthReady?: boolean }) =>
  renderHook((p: { settings: BakerySettings; settingsLoaded: boolean; isAuthReady?: boolean }) =>
    useSettings(p.settings, vi.fn(), p.isAuthReady ?? true, ['Raw Materials'], { code: 'INR' }, vi.fn(), vi.fn(), p.settingsLoaded),
    { initialProps: initial });

const settingsWrites = () => setDoc.mock.calls.filter(c => c[0].path === 'users/user1/settings/bakery');

beforeEach(() => { vi.useFakeTimers(); setDoc.mockReset(); setDoc.mockResolvedValue(undefined); });
afterEach(() => vi.useRealTimers());

describe('autosaving settings', () => {
  it('never writes the built-in defaults over the stored settings while they have not loaded', async () => {
    mount({ settings: DEFAULTS, settingsLoaded: false });
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(settingsWrites()).toHaveLength(0);
  });

  it('does not write when the stored settings arrive: they are what the server already holds', async () => {
    const { rerender } = mount({ settings: DEFAULTS, settingsLoaded: false });
    await act(async () => { vi.advanceTimersByTime(5_000); });
    rerender({ settings: STORED, settingsLoaded: true });
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(settingsWrites()).toHaveLength(0);
  });

  it('saves a change the owner makes, once, a second after the last edit, with everything in it', async () => {
    const { rerender } = mount({ settings: STORED, settingsLoaded: true });
    await act(async () => { vi.advanceTimersByTime(5_000); });
    rerender({ settings: { ...STORED, name: 'Asha Bakes & Co' }, settingsLoaded: true });
    await act(async () => { vi.advanceTimersByTime(500); });
    rerender({ settings: { ...STORED, name: 'Asha Bakes & Co.' }, settingsLoaded: true });
    await act(async () => { vi.advanceTimersByTime(999); });
    expect(settingsWrites()).toHaveLength(0);
    await act(async () => { vi.advanceTimersByTime(2); });
    expect(settingsWrites()).toHaveLength(1);
    expect(settingsWrites()[0][1]).toMatchObject({ name: 'Asha Bakes & Co.', phone: '+91 98450 10101', upiId: 'asha@upi' });
    expect(settingsWrites()[0][2]).toEqual({ merge: true });
  });

  it('does not save the same settings twice', async () => {
    const { rerender } = mount({ settings: STORED, settingsLoaded: true });
    rerender({ settings: { ...STORED, name: 'New' }, settingsLoaded: true });
    await act(async () => { vi.advanceTimersByTime(2_000); });
    rerender({ settings: { ...STORED, name: 'New' }, settingsLoaded: true });
    await act(async () => { vi.advanceTimersByTime(2_000); });
    expect(settingsWrites()).toHaveLength(1);
  });

  it('starts again after a new sign-in: the first settings of the new account are not saved either', async () => {
    const { rerender } = mount({ settings: STORED, settingsLoaded: true });
    rerender({ settings: { ...STORED, name: 'Edited' }, settingsLoaded: true });
    await act(async () => { vi.advanceTimersByTime(2_000); });
    expect(settingsWrites()).toHaveLength(1);

    rerender({ settings: DEFAULTS, settingsLoaded: false }); // another account signs in; its settings are not read yet
    await act(async () => { vi.advanceTimersByTime(5_000); });
    rerender({ settings: { ...DEFAULTS, name: 'Other Cafe' }, settingsLoaded: true });
    await act(async () => { vi.advanceTimersByTime(5_000); });
    expect(settingsWrites()).toHaveLength(1);
  });

  it('does nothing before sign-in is ready', async () => {
    const { rerender } = mount({ settings: STORED, settingsLoaded: true, isAuthReady: false });
    rerender({ settings: { ...STORED, name: 'X' }, settingsLoaded: true, isAuthReady: false });
    await act(async () => { vi.advanceTimersByTime(5_000); });
    expect(settingsWrites()).toHaveLength(0);
  });
});

describe('the explicit Save button', () => {
  it('saves everything once the stored settings have loaded', async () => {
    const { result } = mount({ settings: STORED, settingsLoaded: true });
    await act(async () => { await result.current.saveSettings(); });
    expect(settingsWrites()).toHaveLength(1);
    expect(settingsWrites()[0][1]).toMatchObject({ name: 'Asha Bakes', categories: ['Raw Materials'], currency: { code: 'INR' } });
  });

  it('does nothing before they have loaded, so it cannot write the defaults over them', async () => {
    const { result } = mount({ settings: DEFAULTS, settingsLoaded: false });
    await act(async () => { await result.current.saveSettings(); });
    expect(settingsWrites()).toHaveLength(0);
  });
});
