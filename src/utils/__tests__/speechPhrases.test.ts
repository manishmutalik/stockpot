import { describe, it, expect } from 'vitest';
import { SPEECH_PHRASES_MAX, speechPhrases, spokenName } from '../speechPhrases';

describe('spokenName', () => {
  it('drops what is in brackets and any weight, as the item is spoken', () => {
    expect(spokenName('Pumpkin Seed Bread (500g)')).toBe('Pumpkin Seed Bread');
    expect(spokenName('Pumpkin Seed Bread 350 gm')).toBe('Pumpkin Seed Bread');
    expect(spokenName('Chocolate Cake 1.5 kg')).toBe('Chocolate Cake');
    expect(spokenName('Cold Coffee 250ml')).toBe('Cold Coffee');
    expect(spokenName('Sourdough Loaf')).toBe('Sourdough Loaf');
  });
});

describe('speechPhrases', () => {
  const menu = [{ name: 'Pumpkin Seed Bread (350g)' }, { name: 'Pumpkin Seed Bread (500g)' }, { name: 'Butter Croissant' }];
  const materials = [{ name: 'Khapli Flour' }, { name: 'Coconut Oil' }];

  it('lists menu items as spoken and as written, then materials, without repeats', () => {
    expect(speechPhrases({ menu, materials })).toEqual([
      'Pumpkin Seed Bread', 'Butter Croissant', 'Pumpkin Seed Bread (350g)', 'Pumpkin Seed Bread (500g)', 'Khapli Flour', 'Coconut Oil',
    ]);
  });

  it('leaves customers out unless they are given, and then adds the full name and the first name', () => {
    expect(speechPhrases({ menu, materials })).not.toContain('Priya');
    const withCustomers = speechPhrases({ menu, materials, customers: ['Priya Sharma', 'Customer not named', 'Ravi'] });
    expect(withCustomers).toContain('Priya Sharma');
    expect(withCustomers).toContain('Priya');
    expect(withCustomers).toContain('Ravi');
    expect(withCustomers).not.toContain('Customer not named');
    // the menu still comes first
    expect(withCustomers.indexOf('Pumpkin Seed Bread')).toBeLessThan(withCustomers.indexOf('Priya Sharma'));
  });

  it('treats the same name in another case as one, and skips empty, one-letter and very long names', () => {
    const out = speechPhrases({ menu: [{ name: 'BROWNIE' }, { name: 'brownie' }, { name: '' }, { name: 'x' }, { name: 'a'.repeat(80) }, {}], materials: [] });
    expect(out).toEqual(['BROWNIE']);
  });

  it('never gives more than the recogniser can take, keeping the menu', () => {
    const many = Array.from({ length: 300 }, (_, i) => ({ name: `Item number ${i}` }));
    const out = speechPhrases({ menu: many.slice(0, 120), materials: many.slice(120), customers: ['Priya Sharma'] });
    expect(out).toHaveLength(SPEECH_PHRASES_MAX);
    expect(out[0]).toBe('Item number 0');
    expect(out).not.toContain('Priya Sharma');
  });
});
