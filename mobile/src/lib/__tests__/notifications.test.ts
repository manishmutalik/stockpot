import { describe, it, expect } from 'vitest';
import { EVENING_TIMES, MORNING_TIMES, routeForNotification, timeLabel, withSwitch, withTime } from '../notifications';
import type { NotificationSettings } from '../../../../src/utils/quickApiTypes';

const base: NotificationSettings = { morningSummary: { enabled: true, time: '08:00' }, lowStock: true, useBy: true, dueTomorrow: { enabled: false, time: '19:00' } };

describe('timeLabel', () => {
  it('writes a time the way people say it', () => {
    expect(timeLabel('08:00')).toBe('8:00 am');
    expect(timeLabel('00:00')).toBe('12:00 am');
    expect(timeLabel('12:00')).toBe('12:00 pm');
    expect(timeLabel('13:05')).toBe('1:05 pm');
    expect(timeLabel('19:30')).toBe('7:30 pm');
    expect(timeLabel('23:59')).toBe('11:59 pm');
  });
  it('offers morning times before noon and evening times after', () => {
    expect(MORNING_TIMES.every(t => Number(t.slice(0, 2)) < 12)).toBe(true);
    expect(EVENING_TIMES.every(t => Number(t.slice(0, 2)) >= 17)).toBe(true);
    expect(MORNING_TIMES).toContain('08:00');
    expect(EVENING_TIMES).toContain('19:00');
  });
});

describe('changing the settings', () => {
  it('turns a switch on or off and leaves the rest as they were', () => {
    expect(withSwitch(base, 'lowStock', false)).toEqual({ ...base, lowStock: false });
    expect(withSwitch(base, 'useBy', false)).toEqual({ ...base, useBy: false });
    expect(withSwitch(base, 'dueTomorrow', true)).toEqual({ ...base, dueTomorrow: { enabled: true, time: '19:00' } });
    expect(withSwitch(base, 'morningSummary', false)).toEqual({ ...base, morningSummary: { enabled: false, time: '08:00' } });
  });
  it('changes a time and keeps the switch', () => {
    expect(withTime(base, 'morningSummary', '07:00')).toEqual({ ...base, morningSummary: { enabled: true, time: '07:00' } });
    expect(withTime(base, 'dueTomorrow', '20:00')).toEqual({ ...base, dueTomorrow: { enabled: false, time: '20:00' } });
  });
  it('never changes the settings it was given', () => {
    const copy = JSON.parse(JSON.stringify(base));
    withSwitch(base, 'lowStock', false); withTime(base, 'morningSummary', '09:00');
    expect(base).toEqual(copy);
  });
});

describe('routeForNotification', () => {
  it('goes where the server said', () => {
    expect(routeForNotification({ type: 'morning', screen: 'today' })).toEqual({ pathname: '/' });
    expect(routeForNotification({ screen: 'upcoming' })).toEqual({ pathname: '/upcoming' });
    expect(routeForNotification({ screen: 'items' })).toEqual({ pathname: '/' });
    expect(routeForNotification({ screen: 'stock-in' })).toEqual({ pathname: '/capture', params: { kind: 'restock' } });
    expect(routeForNotification({ screen: 'payments-due' })).toEqual({ pathname: '/upcoming', params: { tab: 'payments' } });
  });
  it('does nothing for a screen this version does not have, or no data', () => {
    for (const d of [{ screen: 'printer' }, {}, null, undefined, 'today', 5, { screen: 7 }]) expect(routeForNotification(d), String(d)).toBeNull();
  });
});
