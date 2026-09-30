import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddMaterialModal } from '../AddMaterialModal';

const empty = { name: '', unit: 'g', stock: '', cost: '', threshold: '', expiry: '' };

function setup(fields = empty) {
  const props = { category: 'Dairy', currency: { symbol: '$' }, fields, onChange: vi.fn(), onSubmit: vi.fn((e: any) => e.preventDefault()), onClose: vi.fn() };
  render(<AddMaterialModal {...props} />);
  return props;
}

describe('AddMaterialModal', () => {
  it('names the category being added to', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Add New Item' })).toBeTruthy();
    expect(screen.getByText('Adding to Dairy')).toBeTruthy();
  });

  it('reports each field by name', () => {
    const props = setup();
    fireEvent.change(screen.getByLabelText('Item name *'), { target: { value: 'Milk' } });
    expect(props.onChange).toHaveBeenLastCalledWith('name', 'Milk');
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'l' } });
    expect(props.onChange).toHaveBeenLastCalledWith('unit', 'l');
    fireEvent.change(screen.getByLabelText('Initial stock'), { target: { value: '5' } });
    expect(props.onChange).toHaveBeenLastCalledWith('stock', '5');
    fireEvent.change(screen.getByLabelText('Cost per unit ($)'), { target: { value: '1.5' } });
    expect(props.onChange).toHaveBeenLastCalledWith('cost', '1.5');
    fireEvent.change(screen.getByLabelText('Low stock alert (g)'), { target: { value: '2' } });
    expect(props.onChange).toHaveBeenLastCalledWith('threshold', '2');
    fireEvent.change(screen.getByLabelText('Expiry date (optional)'), { target: { value: '2026-05-01' } });
    expect(props.onChange).toHaveBeenLastCalledWith('expiry', '2026-05-01');
  });

  it('cannot be submitted without a name, then submits and closes', () => {
    const props = setup();
    expect((screen.getByRole('button', { name: /Add Item/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByLabelText('Close'));
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it('submits once a name is present', () => {
    const props = setup({ ...empty, name: 'Milk' });
    fireEvent.click(screen.getByRole('button', { name: /Add Item/ }));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });
});
