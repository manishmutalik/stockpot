import { describe, it, expect } from 'vitest';
import { PROVIDERS, emptyForm, providerInfo, requestBody, summarize, validateForm, type GatewayForm } from '../onlinePayments';

const form = (over: Partial<GatewayForm>): GatewayForm => ({ ...emptyForm(), ...over });

describe('validateForm', () => {
  it('accepts a Razorpay pair, a Cashfree pair that says which service, and an https link', () => {
    expect(validateForm(form({ provider: 'razorpay', keyId: 'rzp_test_AbC123', keySecret: 'secretvalue1' }))).toBeNull();
    expect(validateForm(form({ provider: 'cashfree', keyId: 'CF12345', keySecret: 'cfsk_secret_1', environment: 'sandbox' }))).toBeNull();
    expect(validateForm(form({ provider: 'link', link: ' https://rzp.io/l/anita ' }))).toBeNull();
  });

  it('says what is missing or wrong, in words', () => {
    expect(validateForm(form({ provider: 'razorpay' }))).toBe('Enter your Key ID.');
    expect(validateForm(form({ provider: 'razorpay', keyId: 'abcdef123456', keySecret: 'secretvalue1' }))).toMatch(/starts with rzp_test_ or rzp_live_/);
    expect(validateForm(form({ provider: 'razorpay', keyId: 'rzp_test_AbC123' }))).toBe('Enter your Key Secret.');
    expect(validateForm(form({ provider: 'razorpay', keyId: 'rzp_test_AbC123', keySecret: 'has a space' }))).toMatch(/should not have spaces/);
    expect(validateForm(form({ provider: 'cashfree', keyId: 'CF12345', keySecret: 'cfsk_secret_1' }))).toMatch(/test \(sandbox\) or the live/);
    for (const link of ['', 'not a link', 'http://insecure.example/pay', 'javascript:alert(1)']) {
      expect(validateForm(form({ provider: 'link', link })), link).toMatch(/starting with https/);
    }
  });
});

describe('requestBody', () => {
  it('sends only what the server needs, trimmed, and the service only for Cashfree', () => {
    expect(requestBody(form({ provider: 'razorpay', keyId: ' rzp_test_AbC123 ', keySecret: ' secretvalue1 ', environment: 'sandbox' })))
      .toEqual({ provider: 'razorpay', keyId: 'rzp_test_AbC123', keySecret: 'secretvalue1' });
    expect(requestBody(form({ provider: 'cashfree', keyId: 'CF12345', keySecret: 'cfsk_secret_1', environment: 'production' })))
      .toEqual({ provider: 'cashfree', keyId: 'CF12345', keySecret: 'cfsk_secret_1', environment: 'production' });
    expect(requestBody(form({ provider: 'link', link: ' https://rzp.io/l/anita ', keySecret: 'leftover' }))).toEqual({ provider: 'link', link: 'https://rzp.io/l/anita' });
  });
});

describe('summarize', () => {
  it('describes a saved setup with at most the last four characters of the secret', () => {
    expect(summarize({ serverReady: true, configured: false })).toBeNull();
    const live = summarize({ serverReady: true, configured: true, provider: 'razorpay', keyId: 'rzp_live_x1', secretLast4: 'ABCD', test: false })!;
    expect(live).toEqual({ title: 'Razorpay', details: ['Key ID: rzp_live_x1', 'Key Secret: saved, ends ABCD'], mode: 'live' });
    expect(summarize({ serverReady: true, configured: true, provider: 'cashfree', keyId: 'CF1', secretLast4: 'wxyz', test: true })).toMatchObject({ title: 'Cashfree', mode: 'test' });
    expect(summarize({ serverReady: true, configured: true, provider: 'link', link: 'https://rzp.io/l/anita' })).toEqual({ title: 'Another gateway (payment link)', details: ['https://rzp.io/l/anita'], mode: 'link' });
  });

  it('knows each provider, and falls back to the first for an unknown one', () => {
    expect(PROVIDERS.map(p => p.id)).toEqual(['razorpay', 'cashfree', 'link']);
    expect(providerInfo(undefined).id).toBe('razorpay');
    expect(providerInfo('cashfree').needsEnvironment).toBe(true);
  });
});
