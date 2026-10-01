import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SECTION, LAYOUT, PAGE_HEIGHT, buildMenuMessage, groupMenu, itemHeight, menuFileName, menuItemsToShare, paginateMenu,
  type MenuPage
} from '../menuShare';

const item = (id: string, over: Record<string, any> = {}): any => ({ id, name: `Item ${id}`, sellingPrice: 100, recipe: [], ...over });

/** Height a page's content needs, using the same numbers the layout reserves. */
const usedHeight = (page: MenuPage) =>
  page.sections.reduce((sum, s) => sum + LAYOUT.sectionHeading + s.items.reduce((h, i) => h + itemHeight(i), 0), 0);

describe('menuItemsToShare', () => {
  it('keeps only items a customer can order: a name and a price', () => {
    const shown = menuItemsToShare([item('a'), item('b', { sellingPrice: 0 }), item('c', { name: '  ' }), item('d', { sellingPrice: undefined })]);
    expect(shown.map(i => i.id)).toEqual(['a']);
  });
});

describe('groupMenu', () => {
  it('puts uncategorised items under one "Menu" section', () => {
    const sections = groupMenu([item('a'), item('b')]);
    expect(sections).toEqual([{ title: DEFAULT_SECTION, items: [expect.objectContaining({ id: 'a' }), expect.objectContaining({ id: 'b' })] }]);
  });
  it('groups by category in order of first appearance, keeping menu order inside each', () => {
    const sections = groupMenu([
      item('1', { category: 'Cookies' }), item('2', { category: 'Cakes' }), item('3', { category: 'Cookies' }), item('4', { category: 'Cakes' }),
    ]);
    expect(sections.map(s => s.title)).toEqual(['Cookies', 'Cakes']);
    expect(sections[0].items.map(i => i.id)).toEqual(['1', '3']);
    expect(sections[1].items.map(i => i.id)).toEqual(['2', '4']);
  });
  it('puts items without a category last when others have one, and ignores blank categories and spacing', () => {
    const sections = groupMenu([item('1'), item('2', { category: '  Cakes ' }), item('3', { category: '   ' })]);
    expect(sections.map(s => s.title)).toEqual(['Cakes', DEFAULT_SECTION]);
    expect(sections[1].items.map(i => i.id)).toEqual(['1', '3']);
  });
  it('is empty for an empty menu', () => {
    expect(groupMenu([])).toEqual([]);
  });
});

describe('itemHeight', () => {
  it('is one row without a description, and taller for each wrapped line of one', () => {
    expect(itemHeight(item('a'))).toBe(LAYOUT.itemRow);
    expect(itemHeight(item('a', { description: 'Short' }))).toBe(LAYOUT.itemRow + LAYOUT.descriptionLine);
    expect(itemHeight(item('a', { description: 'x'.repeat(LAYOUT.descriptionChars + 1) }))).toBe(LAYOUT.itemRow + 2 * LAYOUT.descriptionLine);
    expect(itemHeight(item('a', { description: '   ' }))).toBe(LAYOUT.itemRow);
  });
});

describe('paginateMenu', () => {
  it('gives an empty menu one empty page, and a short menu one page', () => {
    expect(paginateMenu([])).toHaveLength(1);
    expect(paginateMenu(groupMenu([item('a'), item('b', { category: 'Cakes' })]))).toHaveLength(1);
  });

  const big = Array.from({ length: 60 }, (_, i) => item(`i${i}`, {
    category: ['Cakes', 'Cookies', 'Breads', 'Drinks'][i % 4],
    description: i % 3 === 0 ? 'A rich, layered description that runs to a second line for sure, because it is long enough.' : undefined,
  }));

  it('splits a long menu over several pages and never runs a page past the bottom', () => {
    const pages = paginateMenu(groupMenu(big));
    expect(pages.length).toBeGreaterThan(1);
    pages.forEach((page, i) => {
      const header = i === 0 ? LAYOUT.firstHeader : LAYOUT.nextHeader;
      expect(header + usedHeight(page)).toBeLessThanOrEqual(PAGE_HEIGHT - 2 * LAYOUT.padding - LAYOUT.footer);
    });
  });

  it('shows every item exactly once, in order within its category', () => {
    const pages = paginateMenu(groupMenu(big));
    const ids = pages.flatMap(p => p.sections.flatMap(s => s.items.map(i => i.id)));
    expect(ids).toHaveLength(60);
    expect(new Set(ids).size).toBe(60);
    const cakes = pages.flatMap(p => p.sections.filter(s => s.title === 'Cakes').flatMap(s => s.items.map(i => i.id)));
    expect(cakes).toEqual(big.filter(i => i.category === 'Cakes').map(i => i.id));
  });

  it('marks a section that carries over to the next page as continued, and never leaves a heading alone', () => {
    const pages = paginateMenu(groupMenu(big));
    for (const page of pages) for (const section of page.sections) expect(section.items.length).toBeGreaterThan(0);
    const firstSeen = new Set<string>();
    for (const page of pages) for (const section of page.sections) {
      expect(!!section.continued).toBe(firstSeen.has(section.title));
      firstSeen.add(section.title);
    }
    expect(pages.flatMap(p => p.sections).some(s => s.continued)).toBe(true);
  });

  it('fits fewer rows on a page when descriptions are long', () => {
    const plain = Array.from({ length: 20 }, (_, i) => item(`p${i}`));
    const wordy = plain.map(i => ({ ...i, description: 'word '.repeat(40) }));
    expect(paginateMenu(groupMenu(wordy)).length).toBeGreaterThan(paginateMenu(groupMenu(plain)).length);
  });

  it('keeps a typical menu of 20 items in categories to one or two pages', () => {
    const typical = Array.from({ length: 20 }, (_, i) => item(`t${i}`, { category: ['Cakes', 'Cookies', 'Breads'][i % 3], description: i % 2 ? 'Freshly baked, made to order' : undefined }));
    expect(paginateMenu(groupMenu(typical)).length).toBeLessThanOrEqual(2);
  });
});

describe('menuFileName and message', () => {
  it('names the file after the business', () => {
    expect(menuFileName("Asha's Bakes & Sons")).toBe('asha-s-bakes-sons-menu.pdf');
    expect(menuFileName('  Crème Brûlée Café ')).toBe('creme-brulee-cafe-menu.pdf');
    expect(menuFileName('')).toBe('stockpot-menu.pdf');
    expect(menuFileName(undefined)).toBe('stockpot-menu.pdf');
    expect(menuFileName('!!!')).toBe('stockpot-menu.pdf');
  });
  it('greets the customer by name when known', () => {
    expect(buildMenuMessage('Priya', 'Asha Bakes')).toBe("Hi Priya, here's our menu from Asha Bakes.");
    expect(buildMenuMessage(undefined, 'Asha Bakes')).toBe("Here's our menu from Asha Bakes.");
    expect(buildMenuMessage('  ', '')).toBe("Here's our menu.");
  });
});
