import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// The modal imports getDefaultRecipeUnit from App, which would pull in Firebase.
vi.mock('../../App', () => ({
  getDefaultRecipeUnit: (u?: string) => (u === 'kg' || u === 'g' ? 'g' : u === 'l' || u === 'ml' ? 'ml' : u || 'g'),
}));
import { IngredientSelectorModal } from '../IngredientSelectorModal';

const materials = [
  { id: 'flour', name: 'Flour', unit: 'kg', category: 'Raw Materials' },
  { id: 'milk', name: 'Milk', unit: 'l', category: 'Dairy' },
  { id: 'box', name: 'Cake Box', unit: 'pcs', category: 'Packaging Materials' },
];
const categories = ['Raw Materials', 'Dairy', 'Packaging Materials'];

function setup() {
  const props = { isOpen: true, onClose: vi.fn(), materials, categories, onAddSelected: vi.fn() };
  render(<IngredientSelectorModal {...props} />);
  return props;
}

describe('IngredientSelectorModal', () => {
  it('lists materials by category, leaving packaging out', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Quick Select Ingredients' })).toBeTruthy();
    expect(screen.getByText('Flour')).toBeTruthy();
    expect(screen.getByText('Milk')).toBeTruthy();
    expect(screen.queryByText('Cake Box')).toBeNull();
  });

  it('searches by name', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Search materials'), { target: { value: 'mil' } });
    expect(screen.queryByText('Flour')).toBeNull();
    expect(screen.getByText('Milk')).toBeTruthy();
  });

  it('selects by typing an amount or ticking, counts them, and adds with recipe units', () => {
    const props = setup();
    expect((screen.getByRole('button', { name: /Add Selected/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Amount of Flour'), { target: { value: '250' } });
    fireEvent.click(screen.getByText('Milk')); // ticking starts at 1
    expect(screen.getByText('2 items selected')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Add Selected/ }));
    expect(props.onAddSelected).toHaveBeenCalledWith([
      { materialId: 'flour', amount: 250, unit: 'g' },
      { materialId: 'milk', amount: 1, unit: 'ml' },
    ]);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('a zero amount deselects', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Amount of Flour'), { target: { value: '5' } });
    expect(screen.getByText('1 item selected')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Amount of Flour'), { target: { value: '0' } });
    expect(screen.getByText('0 items selected')).toBeTruthy();
  });

  it('cancels from the button and the header', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByLabelText('Close'));
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });
});
