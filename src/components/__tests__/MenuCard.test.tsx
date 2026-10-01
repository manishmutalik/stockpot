import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MenuCard } from '../MenuCard';
import { groupMenu, paginateMenu } from '../../utils/menuShare';

const item = (id: string, over: Record<string, any> = {}): any => ({ id, name: `Item ${id}`, sellingPrice: 150, recipe: [], ...over });
const settings = { name: 'Asha Bakes', address: '14 MG Road', phone: '+91 98450 00199', logo: '' };
const INR = { symbol: '₹' };
const draw = (menu: any[], s: any = settings) => render(<MenuCard pages={paginateMenu(groupMenu(menu))} settings={s} currency={INR} />);

describe('MenuCard', () => {
  it('shows a plain name and price for an item with no description or category, and no gaps', () => {
    const { container, getByText, queryByText } = draw([item('a', { name: 'Butter Croissant' })]);
    expect(getByText('Butter Croissant')).toBeTruthy();
    expect(getByText('₹150.00')).toBeTruthy();
    expect(getByText('Menu', { selector: 'h2' })).toBeTruthy(); // the single section heading
    expect(queryByText(/undefined|null/)).toBeNull();
    const row = getByText('Butter Croissant').parentElement!;
    expect(row.children).toHaveLength(1); // only the name: no empty description line
    expect(container.querySelectorAll('[data-menu-page]')).toHaveLength(1);
  });

  it('shows the description under the name, and groups by category', () => {
    const { getByText, getAllByRole } = draw([
      item('a', { name: 'Chocolate Cake', category: 'Cakes', description: 'Rich dark chocolate, 6 inch' }),
      item('b', { name: 'Atta Cookie', category: 'Cookies' }),
    ]);
    expect(getByText('Rich dark chocolate, 6 inch')).toBeTruthy();
    expect(getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual(['Cakes', 'Cookies']);
  });

  it("carries the business's name, address and phone on the first page", () => {
    const { getByText } = draw([item('a')]);
    expect(getByText('Asha Bakes', { selector: 'h1' })).toBeTruthy();
    expect(getByText('14 MG Road · +91 98450 00199')).toBeTruthy();
  });

  it('copes with a business that has not filled in its profile', () => {
    const { getByText } = draw([item('a')], { name: '', address: '', phone: '', logo: '' });
    expect(getByText('Our menu', { selector: 'h1' })).toBeTruthy();
  });

  it('draws a logo at an explicit pixel size, only when it is a usable image', () => {
    const withLogo = draw([item('a')], { ...settings, logo: 'https://example.com/logo.png' });
    const img = withLogo.container.querySelector('img')!;
    expect(img.getAttribute('width')).toBe('64');
    expect(img.getAttribute('height')).toBe('64');
    expect(draw([item('a')], { ...settings, logo: 'javascript:alert(1)' }).container.querySelector('img')).toBeNull();
  });

  it('uses no Tailwind classes at all (html2canvas cannot read oklch colours)', () => {
    const { container } = draw([item('a', { category: 'Cakes', description: 'Nice' }), item('b')]);
    expect(container.querySelectorAll('[class]')).toHaveLength(0);
    expect(container.innerHTML).not.toMatch(/oklch|color-mix/);
  });

  it('numbers the pages and marks continued sections on a long menu', () => {
    const many = Array.from({ length: 50 }, (_, i) => item(`i${i}`, { name: `Item ${i}`, category: 'Cakes', description: 'A longer description line for this one' }));
    const { container, getAllByText } = draw(many);
    const pages = container.querySelectorAll('[data-menu-page]');
    expect(pages.length).toBeGreaterThan(1);
    expect(getAllByText(new RegExp(`1 / ${pages.length}`)).length).toBeGreaterThan(0);
    expect(getAllByText(/Cakes \(continued\)/).length).toBeGreaterThan(0);
  });
});
