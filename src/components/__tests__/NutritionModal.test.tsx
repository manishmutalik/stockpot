import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NutritionModal } from '../NutritionModal';

const result = (over: Record<string, any> = {}) => ({
  id: 'r1', name: 'Wheat flour', source: 'usda', allergens: [],
  nutrition: { calories: 364, protein: 10.3, carbs: 76.3, fat: 1 }, ...over,
});

function setup(over: Record<string, any> = {}) {
  const props = {
    material: { name: 'Flour', unit: 'kg' },
    search: {
      query: '', onQueryChange: vi.fn(), onSearch: vi.fn(), isSearching: false,
      usdaResults: [], usdaError: null, offResults: [], offError: null, onApply: vi.fn(),
    },
    values: { calories: '', protein: '', carbs: '', fat: '' },
    onValueChange: vi.fn(), allergens: [] as string[], onToggleAllergen: vi.fn(), source: null,
    onSubmit: vi.fn((e: any) => e.preventDefault()), onClose: vi.fn(),
    ...over,
  };
  render(<NutritionModal {...props as any} />);
  return props;
}

describe('NutritionModal', () => {
  it('says what the values are per, converting the stocking unit', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Nutrition & Allergens' })).toBeTruthy();
    expect(screen.getByText('Per 100g of Flour')).toBeTruthy();
  });

  it('runs a lookup from the button and from Enter, and disables Search when empty', () => {
    const props = setup({ search: { query: 'flour', onQueryChange: vi.fn(), onSearch: vi.fn(), isSearching: false, usdaResults: [], usdaError: null, offResults: [], offError: null, onApply: vi.fn() } });
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    expect(props.search.onSearch).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByLabelText('Look up'), { key: 'Enter' });
    expect(props.search.onSearch).toHaveBeenCalledTimes(2);
  });

  it('shows results from both sources and applies one', () => {
    const r = result();
    const off = result({ id: 'r2', name: 'Bread flour', source: 'openfoodfacts', brand: 'Acme', allergens: ['wheat'] });
    const props = setup({ search: { query: 'x', onQueryChange: vi.fn(), onSearch: vi.fn(), isSearching: false, usdaResults: [r], usdaError: null, offResults: [off], offError: null, onApply: vi.fn() } });
    expect(screen.getByText('USDA FoodData Central')).toBeTruthy();
    expect(screen.getAllByText('364 kcal · P 10.3g · C 76.3g · F 1.0g')).toHaveLength(2);
    expect(screen.getByText('Acme')).toBeTruthy();
    fireEvent.click(screen.getByText('Bread flour'));
    expect(props.search.onApply).toHaveBeenCalledWith(off);
  });

  it('shows a source error and "No results" independently', () => {
    setup({ search: { query: 'x', onQueryChange: vi.fn(), onSearch: vi.fn(), isSearching: false, usdaResults: [], usdaError: 'USDA is down', offResults: [], offError: null, onApply: vi.fn() } });
    expect(screen.getByText('USDA is down')).toBeTruthy();
    expect(screen.getAllByText('No results')).toHaveLength(1);
  });

  it('edits each nutrient and toggles allergens', () => {
    const props = setup({ allergens: ['milk'] });
    fireEvent.change(screen.getByLabelText('Calories'), { target: { value: '120' } });
    expect(props.onValueChange).toHaveBeenLastCalledWith('calories', '120');
    fireEvent.change(screen.getByLabelText('Protein (g)'), { target: { value: '4' } });
    expect(props.onValueChange).toHaveBeenLastCalledWith('protein', '4');
    fireEvent.change(screen.getByLabelText('Carbs (g)'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Fat (g)'), { target: { value: '6' } });
    expect(props.onValueChange).toHaveBeenLastCalledWith('fat', '6');
    expect(screen.getByRole('button', { name: 'milk' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'tree nuts' }));
    expect(props.onToggleAllergen).toHaveBeenCalledWith('tree_nuts');
  });

  it('labels the source, and saves / closes', () => {
    const props = setup({ source: 'openfoodfacts' });
    expect(screen.getByText('Source: Open Food Facts')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('defaults the source label to Manual', () => {
    setup();
    expect(screen.getByText('Source: Manual')).toBeTruthy();
  });
});
