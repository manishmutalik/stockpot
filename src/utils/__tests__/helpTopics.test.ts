import { describe, it, expect } from 'vitest';
import { HELP_SECTIONS, HELP_TOPICS, helpSectionsFor, helpSpans, helpTopicsFor, searchAllHelp, searchHelp } from '../helpTopics';

describe('help topics', () => {
  it('have unique ids, a known section, at least one app, and a body', () => {
    const ids = HELP_TOPICS.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const sections = new Set(HELP_SECTIONS.map(s => s.id));
    for (const t of HELP_TOPICS) {
      expect(sections.has(t.section), t.id).toBe(true);
      expect(t.apps.length, t.id).toBeGreaterThan(0);
      expect(t.body.length, t.id).toBeGreaterThan(0);
    }
  });
  it('close every bold mark they open', () => {
    for (const t of HELP_TOPICS) {
      const all = [t.title, t.summary, ...t.body.flatMap(b => (b.kind === 'text' ? [b.text] : b.items))];
      for (const s of all) expect((s.match(/\*\*/g) ?? []).length % 2, `${t.id}: ${s}`).toBe(0);
    }
  });
  it('give each app its own topics, grouped by section in order', () => {
    expect(helpTopicsFor('phone').every(t => t.apps.includes('phone'))).toBe(true);
    expect(helpTopicsFor('phone').map(t => t.id)).toContain('phone-voice');
    expect(helpTopicsFor('web').map(t => t.id)).not.toContain('phone-voice');
    const web = helpSectionsFor('web').map(s => s.id);
    expect(web[0]).toBe('start');
    expect(web).not.toContain('phone');
    expect(helpSectionsFor('phone').map(s => s.id)).toContain('phone');
  });
});

describe('searchHelp', () => {
  it('finds topics by title first, then by their words and keywords', () => {
    expect(searchHelp('gst', 'web')[0].id).toBe('gst');
    expect(searchHelp('rent', 'web').map(t => t.id)).toContain('fixed-costs');
    expect(searchHelp('udhaar', 'phone')[0].id).toBe('phone-payments');
  });
  it('needs every word, and gives nothing for an empty search', () => {
    expect(searchHelp('gst zebra', 'web')).toEqual([]);
    expect(searchHelp('  ', 'web')).toEqual([]);
  });
  it('searches both apps with the best match first, the app in use winning a tie', () => {
    expect(searchAllHelp('gst', 'phone')[0].id).toBe('gst');
    expect(searchAllHelp('read recipe', 'phone')[0].id).toBe('read-recipe-phone');
    expect(searchAllHelp('read recipe', 'web')[0].id).toBe('read-recipe-web');
  });
  it('only searches the topics for that app', () => {
    expect(searchHelp('voice mic', 'web')).toEqual([]);
    expect(searchHelp('voice mic', 'phone').length).toBeGreaterThan(0);
  });
});

describe('helpSpans', () => {
  it('splits button names out to be drawn bold', () => {
    expect(helpSpans('Click **Save** now')).toEqual([{ text: 'Click ', bold: false }, { text: 'Save', bold: true }, { text: ' now', bold: false }]);
    expect(helpSpans('**Today**')).toEqual([{ text: 'Today', bold: true }]);
  });
});
