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
    expect(props.updateMenuItemField).not.toHaveBeenCalled(); // saved when typing is done, not per keystroke
    fireEvent.blur(within(c).getByLabelText('Sale price'));
    expect(props.updateMenuItemField).toHaveBeenCalledWith('cake', 'sellingPrice', 12.5);
    fireEvent.change(within(c).getByLabelText('Shelf life in days'), { target: { value: '3' } });
    expect(props.updateMenuItemField).toHaveBeenCalledWith('cake', 'shelfLifeDays', 3);
    fireEvent.change(within(c).getByLabelText('Servings'), { target: { value: '6' } });
    expect(props.updateMenuItemField).toHaveBeenCalledWith('cake', 'servings', 6);
    fireEvent.click(within(c).getByTitle(/Apply the price that earns a 71\.4% margin/));
    expect(props.updateMenuItemField).toHaveBeenCalledWith('cake', 'sellingPrice', 20); // 4.5 x 3.5 = 15.75, rounded up to the next 5
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

  describe('what each product sold and made', () => {
    const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().split('T')[0];
    // A cake sold at 10 that cost 2.50 of ingredients and 2 of packaging to make: 5.50 made a unit.
    const sold = (id: string, over: Record<string, any> = {}) => ({
      id, menuItemId: 'cake', quantity: 2, date: daysAgo(1),
      unitPriceAtSale: 10, unitIngredientCostAtSale: 2.5, unitPackagingCostAtSale: 2, unitInputGstAtSale: 0, itemNameAtSale: 'Cake', ...over,
    });
    const withOrders = (orders: any[]) => render(<MenuView {...makeProps({ orders })} />);
    const salesOf = (name: string) => within(within(card(name)).getByRole('group', { name: `Sales of ${name}` }));

    it('shows units sold, revenue, what it made and the figure per unit over the last 30 days', () => {
      withOrders([sold('a'), sold('b', { quantity: 3 })]);
      const g = salesOf('Cake');
      expect(g.getByText('5 units')).toBeTruthy();
      expect(g.getByText('$50.00')).toBeTruthy();   // revenue
      expect(g.getByText('$27.50')).toBeTruthy();   // made: 50 - 5 x 4.50
      expect(g.getByText(/\$5\.50/)).toBeTruthy();   // a unit
    });

    it('says when a product has not sold in the period', () => {
      withOrders([sold('a')]);
      expect(within(card('Bread')).getByText('No sales in the last 30 days.')).toBeTruthy();
    });

    it('leaves out orders outside the period, and brings them back for all time', () => {
      withOrders([sold('recent'), sold('old', { date: daysAgo(60), quantity: 10 })]);
      expect(salesOf('Cake').getByText('2 units')).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Sales period'), { target: { value: '90' } });
      expect(salesOf('Cake').getByText('12 units')).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Sales period'), { target: { value: '7' } });
      expect(salesOf('Cake').getByText('2 units')).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Sales period'), { target: { value: 'all' } });
      expect(salesOf('Cake').getByText('12 units')).toBeTruthy();
    });

    it('uses the price each order was made at, not the price on the menu now', () => {
      withOrders([sold('a', { unitPriceAtSale: 20 })]); // the menu says 10 today
      expect(salesOf('Cake').getByText('$40.00')).toBeTruthy();
    });

    it('warns when a high recipe margin is eaten away by a discount', () => {
      // Bread has a 90% recipe margin. Ten sold for 100 with an 80 discount leaves 20 of sales and 10 made: 50% kept.
      const bread = sold('b', { menuItemId: 'bread', quantity: 10, unitIngredientCostAtSale: 1, unitPackagingCostAtSale: 0, discount: 80 });
      withOrders([bread]);
      expect(screen.getByText(/recipe margin is 90%, but only 50% of sales is kept/)).toBeTruthy();
    });

    it('shows no figures, rather than failing, when there are no orders', () => {
      render(<MenuView {...makeProps()} />);
      expect(within(card('Cake')).getByText('No sales in the last 30 days.')).toBeTruthy();
    });
  });
});

describe('MenuView pricing', () => {
  const butter = (cost: number): any[] => [
    { id: 'butter', name: 'Butter', unit: 'kg', costPerUnit: cost, category: 'Raw Materials' },
    { id: 'flour', name: 'Flour', unit: 'kg', costPerUnit: 40, category: 'Raw Materials' },
  ];
  const recipe = [{ materialId: 'butter', amount: 200, unit: 'g' }, { materialId: 'flour', amount: 500, unit: 'g' }]; // 120 at butter 500
  const stamped = (id: string, name: string, over: Record<string, any> = {}): any => ({
    id, name, sellingPrice: 400, recipe, pricedAt: '2026-06-01', costAtPricing: 120, materialCostsAtPricing: { butter: 500, flour: 40 }, ...over,
  });

  it('flags an item whose margin slipped with the ingredient that moved, and filters to those items', () => {
    const items = [stamped('a', 'Truffle Cake'), { id: 'b', name: 'Plain Bread', sellingPrice: 100, recipe: [{ materialId: 'flour', amount: 500, unit: 'g' }] }];
    render(<MenuView {...makeProps({ menu: items, materials: butter(640), settings: { name: 'T', timezone: 'UTC' } })} />);
    const badge = within(card('Truffle Cake')).getByRole('button', { expanded: false });
    expect(badge.textContent).toMatch(/Margin 70% → 63%/);
    expect(badge.textContent).toMatch(/Butter \+28%/);
    expect(within(card('Plain Bread')).queryByText(/Margin \d+% →/)).toBeNull();

    expect((screen.getByLabelText('Filter by margin') as HTMLSelectElement).textContent).toContain('Needs repricing (1)');
    fireEvent.change(screen.getByLabelText('Filter by margin'), { target: { value: 'repricing' } });
    expect(screen.getByDisplayValue('Truffle Cake')).toBeTruthy();
    expect(screen.queryByDisplayValue('Plain Bread')).toBeNull();
  });

  it('opens already filtered to the items needing repricing from the Dashboard card', () => {
    const items = [stamped('a', 'Truffle Cake'), stamped('b', 'Fine Cake', { sellingPrice: 900 })];
    render(<MenuView {...makeProps({ menu: items, materials: butter(640), menuFilterOnOpen: 'repricing', settings: { name: 'T', timezone: 'UTC' } })} />);
    expect(screen.getByDisplayValue('Truffle Cake')).toBeTruthy();
    expect(screen.queryByDisplayValue('Fine Cake')).toBeNull();
  });

  it('applies a restoring price from the badge, through the same price update that stamps a new baseline', () => {
    const props = makeProps({ menu: [stamped('a', 'Truffle Cake')], materials: butter(640), settings: { name: 'T', timezone: 'UTC' } });
    render(<MenuView {...props} />);
    fireEvent.click(within(card('Truffle Cake')).getByRole('button', { expanded: false }));
    fireEvent.click(within(card('Truffle Cake')).getByLabelText(/to restore your margin/));
    expect(props.updateMenuItemField).toHaveBeenCalledWith('a', 'sellingPrice', 495);
  });

  it('sets a target margin per item (saved when done typing), with the default as the placeholder', () => {
    const props = makeProps({ settings: { name: 'T', defaultTargetMargin: 65 } });
    render(<MenuView {...props} />);
    const field = within(card('Cake')).getByLabelText('Target margin') as HTMLInputElement;
    expect(field.placeholder).toBe('65.0');
    fireEvent.change(field, { target: { value: '70' } });
    expect(props.updateMenuItemField).not.toHaveBeenCalled();
    fireEvent.blur(field);
    expect(props.updateMenuItemField).toHaveBeenCalledWith('cake', 'targetMargin', 70);
    fireEvent.change(field, { target: { value: '' } });
    fireEvent.blur(field);
    expect(props.updateMenuItemField).not.toHaveBeenCalledWith('cake', 'targetMargin', 0);
  });

  it('suggests the price for the item\'s own target, GST-aware', () => {
    const items = [{ id: 'c', name: 'Cake', sellingPrice: 100, targetMargin: 60, recipe: [{ materialId: 'flour', amount: 250, unit: 'g' }, { materialId: 'box', amount: 1, unit: 'pcs' }] }]; // cost 4.50
    const props = makeProps({ menu: items, settings: { name: 'T', gstApplicable: true, gstRate: 18, gstPricingMode: 'inclusive' } });
    render(<MenuView {...props} />);
    // 4.5 / 0.4 = 11.25, plus 18% GST = 13.275, rounded up to 15
    fireEvent.click(within(card('Cake')).getByTitle(/earns a 60% margin/));
    expect(props.updateMenuItemField).toHaveBeenCalledWith('c', 'sellingPrice', 15);
  });

  it('works the margin out on the pre-GST price when prices include GST', () => {
    const items = [{ id: 'c', name: 'Cake', sellingPrice: 118, recipe: [{ materialId: 'flour', amount: 1000, unit: 'g' }] }]; // cost 10
    render(<MenuView {...makeProps({ menu: items, settings: { name: 'T', gstApplicable: true, gstRate: 18, gstPricingMode: 'inclusive' } })} />);
    expect(within(card('Cake')).getByText('90% Margin')).toBeTruthy(); // (100 - 10) / 100, not (118 - 10) / 118
  });

  it('opens the What if… modal', () => {
    render(<MenuView {...makeProps({ settings: { name: 'T', timezone: 'UTC' } })} />);
    fireEvent.click(screen.getByRole('button', { name: /What if/ }));
    expect(screen.getByRole('dialog', { name: /What if I change prices/ })).toBeTruthy();
  });
});
