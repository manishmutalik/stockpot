import { describe, expect, it } from 'vitest';
import { checkWaitlist, indianMobile } from '../waitlist';

describe('indianMobile', () => {
  it('keeps the 10 digits of an Indian mobile, however it was typed', () => {
    for (const typed of ['98765 43210', '+91 98765-43210', '919876543210', '09876543210', '(98765) 43210']) {
      expect(indianMobile(typed), typed).toBe('9876543210');
    }
  });

  it('refuses what is not an Indian mobile', () => {
    for (const typed of ['12345 67890', '98765', '+1 415 555 0100', '98765 4321x', '']) expect(indianMobile(typed), typed).toBeNull();
  });
});

describe('checkWaitlist', () => {
  it('takes a name and a WhatsApp number, with the business and city if given', () => {
    expect(checkWaitlist({ name: '  Asha  Rao ', contact: '+91 98765 43210', business: 'Home bakery', city: ' Pune ' })).toEqual({
      ok: true, entry: { name: 'Asha Rao', contact: '9876543210', contactType: 'whatsapp', business: 'Home bakery', city: 'Pune' },
    });
  });

  it('takes an email instead, in lower case, and leaves out what was not given', () => {
    expect(checkWaitlist({ name: 'Ravi', contact: 'Ravi.K@Example.com' })).toEqual({
      ok: true, entry: { name: 'Ravi', contact: 'ravi.k@example.com', contactType: 'email', business: null, city: null },
    });
  });

  it('says which field is wrong', () => {
    expect(checkWaitlist({ name: 'A', contact: '9876543210' })).toMatchObject({ ok: false, field: 'name' });
    expect(checkWaitlist({ name: 'Asha', contact: '' })).toMatchObject({ ok: false, field: 'contact', message: /WhatsApp number or an email/ });
    expect(checkWaitlist({ name: 'Asha', contact: 'asha at gmail' })).toMatchObject({ ok: false, field: 'contact' });
    expect(checkWaitlist({ name: 'Asha', contact: '9876543210', business: 'Bank' })).toMatchObject({ ok: false, field: 'business' });
    expect(checkWaitlist({ name: 'Asha', contact: '9876543210', city: 'x'.repeat(61) })).toMatchObject({ ok: false, field: 'city' });
    expect(checkWaitlist({ name: 42, contact: ['x'] })).toMatchObject({ ok: false, field: 'name' });
  });
});
