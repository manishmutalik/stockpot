/**
 * dates.ts
 *
 * Calendar days as the server writes them (YYYY-MM-DD, in the business's own time zone), turned into the words the screens use.
 * Pure arithmetic on the strings, with no clock and no Intl: "today" always comes from the server, so a phone set to another
 * time zone cannot call tomorrow's order due today.
 */
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const parts = (iso: string): [number, number, number] => { const [y, m, d] = iso.split('-').map(Number); return [y, m, d]; };

/** "Wed 7 Oct". */
export function formatDay(iso: string): string {
  const [y, m, d] = parts(iso);
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

/** Whole days from one date to a later one (negative if the second is earlier). */
export function daysBetween(from: string, to: string): number {
  const a = parts(from), b = parts(to);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86_400_000);
}

/** "morning" → "Morning"; a time such as "10:30" stays as it is; nothing → null. */
export function slotLabel(slot: string | null): string | null {
  if (!slot) return null;
  return /^\d{1,2}:\d{2}$/.test(slot) ? slot : slot.charAt(0).toUpperCase() + slot.slice(1);
}
