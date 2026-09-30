import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DiscardModal } from '../DiscardModal';

const base = { name: 'Cake', unit: 'pcs', maxQty: 4, costPerUnit: 12.5 };

function setup(target: Record<string, any> = base, over: Record<string, any> = {}) {
  const props = {
    target, currency: { symbol: '$' },
    qty: '', onQtyChange: vi.fn(), reason: '', onReasonChange: vi.fn(),
    onSubmit: vi.fn((e: any) => e.preventDefault()), onClose: vi.fn(),
    ...over,
  };
  render(<DiscardModal {...props as any} />);
  return props;
}

describe('DiscardModal', () => {
  it('discards as plain wastage by default', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Discard Cake' })).toBeTruthy();
    expect(screen.getByText('Log wasted stock and track cost')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Confirm Discard/ })).toBeTruthy();
  });

  it('frames Personal Use and Sampling with their own title, note and button', () => {
    setup({ ...base, presetReason: 'Sampling' });
    expect(screen.getByRole('dialog', { name: 'Sampling: Cake' })).toBeTruthy();
    expect(screen.getByText('Log as sampling · excluded from income')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Confirm Sampling/ })).toBeTruthy();
  });

  it('reports quantity and reason changes and can fill in the maximum', () => {
    const props = setup();
    fireEvent.change(screen.getByLabelText('Quantity to discard (pcs)'), { target: { value: '2' } });
    expect(props.onQtyChange).toHaveBeenCalledWith('2');
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Burnt' } });
    expect(props.onReasonChange).toHaveBeenCalledWith('Burnt');
    fireEvent.click(screen.getByRole('button', { name: /Use max \(4 pcs\)/ }));
    expect(props.onQtyChange).toHaveBeenLastCalledWith('4');
  });

  it('shows the cost that will be recorded, only when the item has a cost', () => {
    setup(base, { qty: '3' });
    expect(screen.getByText('Cost recorded')).toBeTruthy();
    expect(screen.getByText('$37.50')).toBeTruthy(); // 3 x 12.50
  });

  it('hides the cost box for a zero-cost item', () => {
    setup({ ...base, costPerUnit: 0 }, { qty: '3' });
    expect(screen.queryByText('Cost recorded')).toBeNull();
  });

  it('submits and closes', () => {
    const props = setup(base, { qty: '1', reason: 'Spilled' });
    fireEvent.click(screen.getByRole('button', { name: /Confirm Discard/ }));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
