import { describe, it, expect } from 'vitest';
import { addDays, COMMON_TIME_ZONES, daysBetween, DEFAULT_TIME_ZONE, isValidTimeZone, resolveTimeZone, todayInZone, yesterdayInZone } from '../localDate';

describe('todayInZone', () => {
  // 20:30 UTC on 10 March is 02:00 on 11 March in India (UTC+5:30)
  const lateEvening = new Date('2026-03-10T20:30:00Z');

  it("is the business's own date, not UTC's: an Indian shop is already on the next day", () => {
    expect(todayInZone('Asia/Kolkata', lateEvening)).toBe('2026-03-11');
    expect(todayInZone('UTC', lateEvening)).toBe('2026-03-10');
  });

  it('is still yesterday in India until 05:30', () => {
    expect(todayInZone('Asia/Kolkata', new Date('2026-03-10T18:29:00Z'))).toBe('2026-03-10');
    expect(todayInZone('Asia/Kolkata', new Date('2026-03-10T18:30:00Z'))).toBe('2026-03-11');
  });

  it('goes the other way for the Americas', () => {
    expect(todayInZone('America/Los_Angeles', new Date('2026-03-10T03:00:00Z'))).toBe('2026-03-09');
  });

  it('defaults to India when no zone is set or it is not a real zone', () => {
    expect(todayInZone(undefined, lateEvening)).toBe('2026-03-11');
    expect(todayInZone('Not/AZone', lateEvening)).toBe('2026-03-11');
    expect(resolveTimeZone('')).toBe(DEFAULT_TIME_ZONE);
  });

  it('yesterday is a day before that', () => {
    expect(yesterdayInZone('Asia/Kolkata', lateEvening)).toBe('2026-03-10');
    expect(yesterdayInZone('Asia/Kolkata', new Date('2026-03-01T01:00:00Z'))).toBe('2026-02-28');
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA names and refuses anything else', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('IST')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(5)).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
  });

  it('knows every zone offered in Settings', () => {
    for (const z of COMMON_TIME_ZONES) expect(isValidTimeZone(z.value)).toBe(true);
    expect(COMMON_TIME_ZONES[0].value).toBe(DEFAULT_TIME_ZONE);
  });
});

describe('addDays and daysBetween', () => {
  it('move across month, year and leap-day boundaries', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-10', 0)).toBe('2026-03-10');
  });

  it('count whole days, either way', () => {
    expect(daysBetween('2026-03-01', '2026-03-10')).toBe(9);
    expect(daysBetween('2026-03-10', '2026-03-01')).toBe(-9);
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
    expect(daysBetween('2026-03-10', '2026-03-10')).toBe(0);
  });

  it('are not thrown by daylight saving', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2); // US clocks change on 8 March
  });
});
