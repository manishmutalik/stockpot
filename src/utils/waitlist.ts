/**
 * waitlist.ts
 *
 * The landing page's "Join the waitlist" before launch: who is interested, and how to reach them when Stockpot opens.
 * Checked the same way in the browser (to say what is wrong before sending) and on the server (lib/waitlistRoutes, which
 * stores it in the top-level `waitlist` collection, readable only from the Firebase console).
 *
 * One contact field takes a WhatsApp number or an email: most home food businesses in India would rather be messaged on
 * WhatsApp. A number is kept as 10 digits (an Indian mobile), an email in lower case, so the same person signing up twice
 * is one entry.
 */

export const WAITLIST_BUSINESS_TYPES = ['Home bakery', 'Home chef', 'Tiffin service', 'Cloud kitchen', 'Café or restaurant', 'Other'] as const;
export type WaitlistBusinessType = (typeof WAITLIST_BUSINESS_TYPES)[number];

/** How many customers at launch get the founding discount. */
export const FOUNDING_CUSTOMERS = 25;

export interface WaitlistEntry {
  name: string;
  /** A 10-digit Indian mobile number, or an email in lower case. */
  contact: string;
  contactType: 'whatsapp' | 'email';
  business: WaitlistBusinessType | null;
  city: string | null;
}

export type WaitlistCheck = { ok: true; entry: WaitlistEntry } | { ok: false; field: 'name' | 'contact' | 'business' | 'city'; message: string };

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;

/** A WhatsApp number as 10 digits: spaces, dashes, brackets, +91, 91 and a leading 0 are taken off. Null if it is not an Indian mobile. */
export function indianMobile(raw: string): string | null {
  let digits = raw.replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(digits)) return null;
  digits = digits.replace(/^\+/, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

/** Checks what was typed into the form (or sent to the server). */
export function checkWaitlist(input: { name?: unknown; contact?: unknown; business?: unknown; city?: unknown }): WaitlistCheck {
  const name = text(input.name);
  if (name.length < 2) return { ok: false, field: 'name', message: 'Please tell us your name.' };
  if (name.length > 80) return { ok: false, field: 'name', message: 'That name is too long.' };
  const contactRaw = text(input.contact);
  if (!contactRaw) return { ok: false, field: 'contact', message: 'Please give a WhatsApp number or an email.' };
  const mobile = indianMobile(contactRaw);
  const isEmail = !mobile && contactRaw.length <= 254 && EMAIL.test(contactRaw);
  if (!mobile && !isEmail) return { ok: false, field: 'contact', message: 'That does not look like a 10-digit mobile number or an email.' };
  const businessRaw = text(input.business);
  if (businessRaw && !(WAITLIST_BUSINESS_TYPES as readonly string[]).includes(businessRaw)) return { ok: false, field: 'business', message: 'Please choose your kind of business.' };
  const city = text(input.city);
  if (city.length > 60) return { ok: false, field: 'city', message: 'That city name is too long.' };
  return {
    ok: true,
    entry: {
      name,
      contact: mobile ?? contactRaw.toLowerCase(),
      contactType: mobile ? 'whatsapp' : 'email',
      business: (businessRaw || null) as WaitlistBusinessType | null,
      city: city || null,
    },
  };
}
