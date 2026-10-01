import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MenuView } from '../MenuView';

const materials: any[] = [
  { id: 'flour', name: 'Flour', unit: 'kg', costPerUnit: 10, category: 'Raw Materials' },
  { id: 'box', name: 'Cake Box', unit: 'pcs', costPerUnit: 2, category: 'Packaging Materials' },
];
const menu: any[] = [
  { id: 'cake', name: 'Cake', sellingPrice: 10, servings: 4, recipe: [{ materialId: 'flour', amount: 250, unit: 'g' }, { materialId: 'box', amount: 1, unit: 'pcs' }] }, // cost 4.50 -> 55%
  { id: 'bread', name: 'Bread', sellingPrice: 10, recipe: [{ materialId: 'flour', amount: 100, unit: 'g' }] }, // cost 1 -> 90%
  { id: 'loss', name: 'Loss Leader', sellingPrice: 2, recipe: [{ materialId: 'flour', amount: 500, unit: 'g' }] }, // cost 5 -> loss
  { id: 'free', name: 'Unpriced', sellingPrice: 0, recipe: [] },
];

const makeProps = (over: Record<string, any> = {}) => ({
  materials, menu,
  categories: ['Raw Materials', 'Packaging Materials'],
  settings: { name: 'Test Bakery' },
  currency: { code: 'USD', symbol: '$' },
  expandedRecipeId: null,
  setExpandedRecipeId: vi.fn(),
  setIsIngredientSelectorOpen: vi.fn(),
  setActiveRecipeItemId: vi.fn(),
  addMenuItem: vi.fn(), updateMenuItem: vi.fn(), updateMenuItemField: vi.fn(), deleteMenuItem: vi.fn(),
  copyMenuItem: vi.fn(), addIngredientToRecipe: vi.fn(), updateRecipeIngredient: vi.fn(), removeIngredientFromRecipe: vi.fn(),
  ...over,
}) as any;

const card = (name: string) => screen.getByDisplayValue(name).closest('div.surface-card') as HTMLElement;

describe('MenuView', () => {
  it('summarises the menu', () => {
    render(<MenuView {...makeProps()} />);
    expect(screen.getByText('Menu Items').nextElementSibling?.textContent).toBe('4');
    expect(screen.getByText('Highest Margin Item').nextElementSibling?.textContent).toBe('Bread');
    expect(screen.getByText('Items Needing Review').nextElementSibling?.textContent).toBe('2'); // loss leader + unpriced
  });

  it('shows cost and margin per item, flagging a loss', () => {
    render(<MenuView {...makeProps()} />);
    expect(within(card('Cake')).getByText('55% Margin')).toBeTruthy();
    expect(within(card('Cake')).getByText('Cost: $4.50')).toBeTruthy();
    expect(within(card('Loss Leader')).getByText(/Loss \(-150%\)/)).toBeTruthy();
  });

  it('searches and filters by margin band', () => {
    render(<MenuView {...makeProps()} />);
    fireEvent.change(screen.getByLabelText('Search menu items'), { target: { value: 'bre' } });
    expect(screen.queryByDisplayValue('Cake')).toBeNull();
    expect(screen.getByDisplayValue('Bread')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search menu items'), { target: { value: '' } });

    fireEvent.change(screen.getByLabelText('Filter by margin'), { target: { value: 'mid' } });
    expect(screen.getByDisplayValue('Cake')).toBeTruthy();
    expect(screen.queryByDisplayValue('Bread')).toBeNull();
    fireEvent.change(screen.getByLabelText('Filter by margin'), { target: { value: 'low' } });
    expect(screen.getByDisplayValue('Loss Leader')).toBeTruthy();
    expect(screen.getByDisplayValue('Unpriced')).toBeTruthy();
    expect(screen.queryByDisplayValue('Cake')).toBeNull();
  });

  it('keeps price, shelf life, servings and suggestion wired up', () => {
    const props = makeProps();
    render(<MenuView {...props} />);
    const c = card('Cake');
    fireEvent.change(within(c).getByLabelText('Sale price'), { target: { value: '12.5' } });
    expect(props.updateMenuItemField).toHaveBeenCalledWith('cake', 'sellingPrice', 12.5);
    fireEvent.change(within(c).getByLabelText('Shelf life in days'), { target: { value: '3' } });
    expect(props.updateMenuItemField).toHaveBeenCalledWith('cake', 'shelfLifeDays', 3);
    fireEvent.change(within(c).getByLabelText('Servings'), { target: { value: '6' } });
    expect(props.updateMenuItemField).toHaveBeenCalledWith('cake', 'servings', 6);
    fireEvent.click(within(c).getByTitle('Apply 3.5x markup suggestion'));
    expect(props.updateMenuItemField).toHaveBeenCalledWith('cake', 'sellingPrice', 15.75); // 4.5 x 3.5
    fireEvent.change(within(c).getByLabelText('Item name'), { target: { value: 'Big Cake' } });
    expect(props.updateMenuItem).toHaveBeenCalledWith('cake', 'Big Cake');
  });

  it('duplicates, deletes and toggles the recipe editor', () => {
    const props = makeProps();
    render(<MenuView {...props} />);
    fireEvent.click(screen.getByLabelText('Duplicate Cake'));
    expect(props.copyMenuItem).toHaveBeenCalledWith(menu[0]);
    fireEvent.click(screen.getByLabelText('Delete Cake'));
    expect(props.deleteMenuItem).toHaveBeenCalledWith('cake');
    fireEvent.click(within(card('Cake')).getByTitle('Edit Recipe'));
    expect(props.setExpandedRecipeId).toHaveBeenCalledWith('cake');
  });

  it('explains why a nutrition card cannot be shared without servings', () => {
    render(<MenuView {...makeProps()} />);
    fireEvent.click(screen.getByLabelText('Share nutrition card for Bread'));
    expect(screen.getByText('Set servings for "Bread" before sharing its nutrition card.')).toBeTruthy();
  });

  describe('recipe editor', () => {
    const open = (over: Record<string, any> = {}) => makeProps({ expandedRecipeId: 'cake', ...over });

    it('splits ingredients from packaging and edits the right recipe line', () => {
      const props = open();
      render(<MenuView {...props} />);
      expect(screen.getByText('Recipe cost').nextElementSibling?.textContent).toBe('$4.50');
      // flour is line 0, the box is line 1
      const amounts = screen.getAllByLabelText('Amount');
      expect(amounts).toHaveLength(2);
      fireEvent.change(amounts[1], { target: { value: '2' } });
      expect(props.updateRecipeIngredient).toHaveBeenCalledWith('cake', 1, 'amount', 2);
      fireEvent.change(screen.getAllByLabelText('Unit')[0], { target: { value: 'kg' } });
      expect(props.updateRecipeIngredient).toHaveBeenCalledWith('cake', 0, 'unit', 'kg');
      fireEvent.click(screen.getAllByLabelText('Remove line')[1]);
      expect(props.removeIngredientFromRecipe).toHaveBeenCalledWith('cake', 1);
    });

    it('opens Quick Add and adds by category', () => {
      const props = open();
      render(<MenuView {...props} />);
      fireEvent.click(screen.getByRole('button', { name: /Quick Add/ }));
      expect(props.setActiveRecipeItemId).toHaveBeenCalledWith('cake');
      expect(props.setIsIngredientSelectorOpen).toHaveBeenCalledWith(true);
      fireEvent.click(screen.getByRole('button', { name: /Add Packaging Materials/ }));
      expect(props.addIngredientToRecipe).toHaveBeenCalledWith('cake', 'Packaging Materials');
    });

    it('prompts for servings before estimating nutrition', () => {
      render(<MenuView {...open({ expandedRecipeId: 'bread' })} />);
      expect(screen.getByText('Set servings above to estimate')).toBeTruthy();
    });
  });

  it('shows the empty state with no menu items', () => {
    const props = makeProps({ menu: [] });
    render(<MenuView {...props} />);
    expect(screen.getByText('No menu items yet')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /Add Menu Item/ })[1]);
    expect(props.addMenuItem).toHaveBeenCalled();
  });

  it('lets an item be given a menu category and description for the shared menu', () => {
    const props = makeProps();
    render(<MenuView {...props} />);
    const cake = card('Cake');
    fireEvent.change(within(cake).getByLabelText('Menu category'), { target: { value: 'Cakes' } });
    expect(props.updateMenuItemField).toHaveBeenCalledWith('cake', 'category', 'Cakes');
    fireEvent.change(within(cake).getByLabelText('Menu description'), { target: { value: 'Rich dark chocolate, 6 inch' } });
    expect(props.updateMenuItemField).toHaveBeenCalledWith('cake', 'description', 'Rich dark chocolate, 6 inch');
  });

  it('shows the saved category and description, and suggests the categories already used', () => {
    const withMeta = menu.map(m => m.id === 'cake' ? { ...m, category: 'Cakes', description: 'Rich dark chocolate' } : m.id === 'bread' ? { ...m, category: 'Breads' } : m);
    const { container } = render(<MenuView {...makeProps({ menu: withMeta })} />);
    expect(within(card('Cake')).getByLabelText('Menu category')).toHaveProperty('value', 'Cakes');
    expect(within(card('Cake')).getByLabelText('Menu description')).toHaveProperty('value', 'Rich dark chocolate');
    expect(within(card('Loss Leader')).getByLabelText('Menu category')).toHaveProperty('value', '');
    expect([...container.querySelectorAll('#menu-categories option')].map(o => o.getAttribute('value')).sort()).toEqual(['Breads', 'Cakes']);
  });
});
