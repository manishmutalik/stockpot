/**
 * menuShare.ts
 *
 * Pure logic for the shareable menu PDF: which items appear, how they group
 * into sections, how those sections split across A4 pages, and the file name
 * and WhatsApp message. No React or DOM, so it is unit tested on its own.
 *
 * Only the layout *decisions* live here. MenuCard draws the pages, and
 * pdfExport turns them into a PDF.
 */
import type { MenuItem } from '../types';

export interface MenuSection {
  title: string;
  items: MenuItem[];
  /** True when this section started on an earlier page. */
  continued?: boolean;
}

export interface MenuPage {
  sections: MenuSection[];
}

/** One A4 page in CSS pixels (210 x 297 mm at 96 dpi). */
export const PAGE_WIDTH = 794;
export const PAGE_HEIGHT = 1123;

/** Section title used for items with no category. */
export const DEFAULT_SECTION = 'Menu';

/** Space the layout reserves, in pixels. MenuCard is drawn to these numbers. */
export const LAYOUT = {
  padding: 56,
  firstHeader: 170,
  nextHeader: 64,
  footer: 44,
  sectionHeading: 52,
  itemRow: 46,
  descriptionLine: 18,
  /** Characters of description that fit on one line next to the price column. */
  descriptionChars: 70,
} as const;

/** What a customer should see: items that have a name and a price. */
export const menuItemsToShare = (menu: MenuItem[]): MenuItem[] =>
  menu.filter(m => m.name.trim() && (m.sellingPrice || 0) > 0);

/**
 * Groups items into sections by category, in the order each category first
 * appears in the menu. Items with no category go in a "Menu" section: the
 * only section when nothing is categorised, otherwise last.
 */
export function groupMenu(menu: MenuItem[]): MenuSection[] {
  const sections = new Map<string, MenuItem[]>();
  const uncategorised: MenuItem[] = [];
  for (const item of menuItemsToShare(menu)) {
    const category = (item.category || '').trim();
    if (!category) { uncategorised.push(item); continue; }
    sections.set(category, [...(sections.get(category) ?? []), item]);
  }
  const result: MenuSection[] = [...sections].map(([title, items]) => ({ title, items }));
  if (uncategorised.length > 0) result.push({ title: DEFAULT_SECTION, items: uncategorised });
  return result;
}

/** Estimated height of one item row: name and price, plus its description's wrapped lines. */
export function itemHeight(item: Pick<MenuItem, 'description'>): number {
  const description = (item.description || '').trim();
  const lines = description ? Math.ceil(description.length / LAYOUT.descriptionChars) : 0;
  return LAYOUT.itemRow + lines * LAYOUT.descriptionLine;
}

/**
 * Splits sections across pages so nothing runs off the bottom of a page. A
 * section can continue onto the next page (its heading repeats, marked
 * continued), and a heading is never left alone at the foot of a page.
 * Always returns at least one page.
 */
export function paginateMenu(sections: MenuSection[]): MenuPage[] {
  const bodyHeight = (first: boolean) =>
    PAGE_HEIGHT - 2 * LAYOUT.padding - LAYOUT.footer - (first ? LAYOUT.firstHeader : LAYOUT.nextHeader);

  const pages: MenuPage[] = [{ sections: [] }];
  let room = bodyHeight(true);

  const newPage = () => {
    pages.push({ sections: [] });
    room = bodyHeight(false);
  };

  for (const section of sections) {
    let current: MenuSection | null = null;
    section.items.forEach((item, index) => {
      const h = itemHeight(item);
      const needsHeading = current === null;
      // A new section (or the first item after a page break) must fit its heading and this item.
      if (room < h + (needsHeading ? LAYOUT.sectionHeading : 0)) {
        newPage();
        current = null;
      }
      if (current === null) {
        current = { title: section.title, items: [], continued: index > 0 };
        pages[pages.length - 1].sections.push(current);
        room -= LAYOUT.sectionHeading;
      }
      current.items.push(item);
      room -= h;
    });
  }
  return pages;
}

/** A customer-presentable file name: `<business-name>-menu.pdf`. */
export function menuFileName(businessName: string | undefined): string {
  const slug = (businessName || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'stockpot'}-menu.pdf`;
}

export function buildMenuMessage(customerName: string | undefined, businessName: string | undefined): string {
  const business = (businessName || '').trim();
  const from = business ? ` from ${business}` : '';
  return customerName?.trim()
    ? `Hi ${customerName.trim()}, here's our menu${from}.`
    : `Here's our menu${from}.`;
}
