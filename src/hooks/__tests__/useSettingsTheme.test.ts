import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../../firebase', () => ({ auth: { currentUser: null }, db: {}, doc: vi.fn(), setDoc: vi.fn() }));
import { useSettings } from '../useSettings';
import type { BakerySettings } from '../../types';

const settings = (primaryColor: string): BakerySettings => ({ name: 'B', logo: '', primaryColor, address: '', phone: '', email: '' });
const render = (primaryColor: string) => renderHook(({ c }) => useSettings(settings(c), vi.fn(), false, [], { code: 'INR', symbol: '₹' }, vi.fn(), vi.fn(), false), { initialProps: { c: primaryColor } });

describe('the brand colour themes the app', () => {
  it('sets the colour the app\'s buttons and highlights read, and changes it when the owner picks another', () => {
    const h = render('#2563EB');
    const root = document.documentElement.style;
    expect(root.getPropertyValue('--color-primary')).toBe('#2563EB');
    h.rerender({ c: '#2B313D' });
    expect(root.getPropertyValue('--color-primary')).toBe('#2B313D');
    h.unmount();
    expect(root.getPropertyValue('--color-primary')).toBe('');   // the landing page keeps its own colours
  });

  it('keeps Stockpot teal for an account still on the old default', () => {
    const h = render('#10b981');
    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#00797B');
    h.unmount();
  });
});
