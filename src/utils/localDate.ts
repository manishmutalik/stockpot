/**
 * localDate.ts
 *
 * "Today" and "yesterday" as the business sees them. The rest of the app takes
 * dates from `toISOString()`, which is UTC, so for a business in India the date
 * is still yesterday's from midnight until 05:30. Anything that depends on the
 * calendar day an owner would name (how many days since a customer last
 * ordered, a daily briefing) uses the business's own time zone instead.
 *
 * Pure, and takes the clock as an argument so it is testable.
 */

/** The default time zone: the app is India-first. */
export const DEFAULT_TIME_ZONE = 'Asia/Kolkata';

/** Time zones offered in Settings. Any valid IANA name stored on the settings is still honoured. */
export const COMMON_TIME_ZONES: { value: string; label: string }[] = [
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Asia/Dubai', label: 'UAE (GST)' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Dhaka', label: 'Bangladesh' },
  { value: 'Asia/Colombo', label: 'Sri Lanka' },
  { value: 'Asia/Kathmandu', label: 'Nepal' },
  { value: 'Europe/London', label: 'United Kingdom' },
  { value: 'Europe/Paris', label: 'Central Europe' },
  { value: 'America/New_York', label: 'US Eastern' },
  { value: 'America/Chicago', label: 'US Central' },
  { value: 'America/Los_Angeles', label: 'US Pacific' },
  { value: 'Australia/Sydney', label: 'Sydney' },
  { value: 'UTC', label: 'UTC' },
];

/**
 * True when this is an IANA time zone name the runtime knows ("Asia/Kolkata", or
 * "UTC"). Abbreviations such as "IST" are refused even where the runtime would
 * accept them: they are ambiguous (IST is also Israel and Ireland).
 */
export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone.trim() === '') return false;
  if (timeZone !== 'UTC' && !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+$/.test(timeZone)) return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The configured zone if it is valid, else India. */
export const resolveTimeZone = (timeZone: unknown): string => (isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE);

/** The calendar date (YYYY-MM-DD) it is right now in a time zone. */
export function todayInZone(timeZone: unknown, now: Date = new Date()): string {
  const zone = resolveTimeZone(timeZone);
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** A YYYY-MM-DD date moved by a number of days (negative for earlier). Pure calendar arithmetic, no zones. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().split('T')[0];
}

/** Whole days from one YYYY-MM-DD date to a later one (negative if the second is earlier). */
export function daysBetween(from: string, to: string): number {
  const day = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / 86_400_000;
  };
  return Math.round(day(to) - day(from));
}

/** Yesterday's date in a time zone. */
export const yesterdayInZone = (timeZone: unknown, now: Date = new Date()): string => addDays(todayInZone(timeZone, now), -1);
