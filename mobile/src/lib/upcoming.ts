/**
 * upcoming.ts
 *
 * How the Upcoming screen lays out what the server sends: overdue pre-orders first ("Attention needed"), then one section
 * per day, soonest first, with the words the cards show. Pure, so it is tested; the screen only draws it.
 */
import type { UpcomingOrder, UpcomingView } from '../../../src/utils/quickApiTypes';
import { daysBetween, formatDay } from './dates';

export interface UpcomingSection {
  key: string;
  kind: 'overdue' | 'day';
  /** For a day: "TODAY · WED 7 OCT". For overdue: "ATTENTION NEEDED". */
  title: string;
  /** "1 order", "In 3 days"; empty for overdue. */
  subtitle: string;
  orders: UpcomingOrder[];
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

export function groupUpcoming(view: UpcomingView): UpcomingSection[] {
  const sections: UpcomingSection[] = [];
  if (view.overdue.length > 0) sections.push({ key: 'overdue', kind: 'overdue', title: 'ATTENTION NEEDED', subtitle: '', orders: view.overdue });

  const byDay = new Map<string, UpcomingOrder[]>();
  for (const o of view.upcoming) byDay.set(o.date, [...(byDay.get(o.date) ?? []), o]);
  for (const [date, orders] of [...byDay].sort((a, b) => a[0].localeCompare(b[0]))) {
    const away = daysBetween(view.today, date);
    const label = formatDay(date).toUpperCase();
    sections.push({
      key: date, kind: 'day', orders,
      title: away === 0 ? `TODAY · ${label}` : away === 1 ? `TOMORROW · ${label}` : label,
      subtitle: away <= 1 ? plural(orders.length, 'order') : `In ${away} days`,
    });
  }
  return sections;
}

/** "Due yesterday · Tue 6 Oct", "Due 3 days ago · Sun 4 Oct". */
export function overdueLabel(date: string, today: string): string {
  const ago = daysBetween(date, today);
  return `Due ${ago <= 1 ? 'yesterday' : `${ago} days ago`} · ${formatDay(date)}`;
}

export interface PaymentPill { text: string; tone: 'green' | 'amber' | 'coral' }

/** Where the money stands on an order: nothing left to pay, part paid in advance, or nothing paid yet. */
export function paymentPill(o: Pick<UpcomingOrder, 'balanceDue' | 'advance'>): PaymentPill {
  if (o.balanceDue <= 0.005) return { text: 'FULLY SETTLED', tone: 'green' };
  return o.advance && o.advance.amount > 0 ? { text: 'PARTIAL', tone: 'amber' } : { text: 'PENDING', tone: 'coral' };
}

/** How many orders are waiting, for the tab and the screen's count. */
export const countOrders = (view: UpcomingView): number => view.overdue.length + view.upcoming.length;
