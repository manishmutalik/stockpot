import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RestockModal } from '../RestockModal';

const material = { name: 'Flour', unit: 'kg', initialStock: 2.5, gstRate: 12 };

function setup(over: Record<string, any> = {}) {
  const props = {
    material, currency: { symbol: '$' },
    qty: '', onQtyChange: vi.fn(), baseTotal: '', onBaseTotalChange: vi.fn(),
    expiryDate: '', onExpiryDateChange: vi.fn(), onSubmit: vi.fn((e: any) => e.preventDefault()), onClose: vi.fn(),
    ...over,
  };
  render(<RestockModal {...props as any} />);
  return props;
}

describe('RestockModal', () => {
  it('is a dialog showing the material and its current stock', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Restock Flour' })).toBeTruthy();
    expect(screen.getByText('Current stock 2.5 kg')).toBeTruthy();
  });

  it('reports changes to every field', () => {
    const props = setup();
    fireEvent.change(screen.getByLabelText('Quantity added (kg)'), { target: { value: '10' } });
    expect(props.onQtyChange).toHaveBeenCalledWith('10');
    fireEvent.change(screen.getByLabelText('Total base price paid'), { target: { value: '50' } });
    expect(props.onBaseTotalChange).toHaveBeenCalledWith('50');
    fireEvent.change(screen.getByLabelText('Expiry date of this batch'), { target: { value: '2026-05-01' } });
    expect(props.onExpiryDateChange).toHaveBeenCalledWith('2026-05-01');
  });

  it('shows GST, total paid and cost per unit as you type', () => {
    setup({ qty: '10', baseTotal: '50' });
    expect(screen.getByText('GST (12%)')).toBeTruthy();
    expect(screen.getByText('$6.00')).toBeTruthy(); // 12% of 50
    expect(screen.getByText('$56.00')).toBeTruthy(); // total
    expect(screen.getByText('$5.00')).toBeTruthy(); // 50 / 10 per unit
  });

  it('falls back to the default 5% GST when the material has none', () => {
    setup({ material: { name: 'Salt', unit: 'kg', initialStock: 1 }, qty: '1', baseTotal: '100' });
    expect(screen.getByText('GST (5%)')).toBeTruthy();
    expect(screen.getByText('$105.00')).toBeTruthy();
  });

  it('cannot be confirmed until quantity and price are filled', () => {
    setup();
    expect((screen.getByRole('button', { name: /Confirm Restock/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('submits the form and closes from Cancel, the header button and the backdrop', () => {
    const props = setup({ qty: '1', baseTotal: '2' });
    fireEvent.click(screen.getByRole('button', { name: /Confirm Restock/ }));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByLabelText('Close'));
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!);
    expect(props.onClose).toHaveBeenCalledTimes(3);
    // a click inside the dialog does not count as a backdrop click
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(props.onClose).toHaveBeenCalledTimes(3);
  });
});
