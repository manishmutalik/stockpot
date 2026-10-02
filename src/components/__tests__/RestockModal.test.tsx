import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RestockModal } from '../RestockModal';

const material = { name: 'Flour', unit: 'kg', initialStock: 2.5, gstRate: 12 };

function setup(over: Record<string, any> = {}) {
  const props = {
    material, currency: { symbol: '$' },
    qty: '', onQtyChange: vi.fn(), baseTotal: '', onBaseTotalChange: vi.fn(),
    qtyUnit: '', onQtyUnitChange: vi.fn(), gstApplicable: false,
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
    fireEvent.change(screen.getByLabelText('Quantity added'), { target: { value: '10' } });
    expect(props.onQtyChange).toHaveBeenCalledWith('10');
    fireEvent.change(screen.getByLabelText('Total price paid'), { target: { value: '50' } });
    expect(props.onBaseTotalChange).toHaveBeenCalledWith('50');
    fireEvent.change(screen.getByLabelText('Expiry date of this batch'), { target: { value: '2026-05-01' } });
    expect(props.onExpiryDateChange).toHaveBeenCalledWith('2026-05-01');
  });

  it('shows the cost per unit as you type, and nothing about GST when GST is off', () => {
    setup({ qty: '10', baseTotal: '50' });
    expect(screen.getByText('$5.00')).toBeTruthy(); // 50 / 10 per unit
    expect(screen.queryByText(/GST/)).toBeNull();
    expect(screen.queryByText('Total paid')).toBeNull();
    expect(screen.getByText(/Cost per unit/).textContent).not.toContain('GST');
  });

  it('assumes no GST even for an item that has a GST rate, while GST is off', () => {
    setup({ qty: '10', baseTotal: '50', material: { ...material, gstRate: 12 } });
    expect(screen.queryByText(/GST/)).toBeNull();
    expect(screen.queryByText('$56.00')).toBeNull();
  });

  it('shows GST, total paid and cost per unit before GST when GST is on', () => {
    setup({ qty: '10', baseTotal: '50', gstApplicable: true });
    expect(screen.getByLabelText('Total price paid, before GST')).toBeTruthy();
    expect(screen.getByText('GST (12%)')).toBeTruthy();
    expect(screen.getByText('$6.00')).toBeTruthy(); // 12% of 50
    expect(screen.getByText('$56.00')).toBeTruthy(); // total
    expect(screen.getByText('$5.00')).toBeTruthy();
    expect(screen.getByText(/Cost per unit/).textContent).toContain('before GST');
  });

  it('does not make up a GST rate for an item that has none, and says so', () => {
    setup({ material: { name: 'Salt', unit: 'kg', initialStock: 1 }, qty: '1', baseTotal: '100', gstApplicable: true });
    expect(screen.queryByText(/GST \(/)).toBeNull();
    expect(screen.queryByText('$105.00')).toBeNull();
    expect(screen.getByText(/No GST rate is set for this item/)).toBeTruthy();
  });

  describe('entering the quantity in another unit', () => {
    it('offers grams for an item kept in kilos, starting on the item\'s own unit', () => {
      setup();
      const unit = screen.getByLabelText('Unit of the quantity added') as HTMLSelectElement;
      expect([...unit.options].map(o => o.value)).toEqual(['g', 'kg']);
      expect(unit.value).toBe('kg');
    });

    it('reports the unit chosen', () => {
      const props = setup();
      fireEvent.change(screen.getByLabelText('Unit of the quantity added'), { target: { value: 'g' } });
      expect(props.onQtyUnitChange).toHaveBeenCalledWith('g');
    });

    it('works out the price per kilo from a price paid for grams: 520 for 500 g is 1,040 a kg', () => {
      setup({ material: { name: 'Almonds', unit: 'kg', initialStock: 1 }, qty: '500', qtyUnit: 'g', baseTotal: '520' });
      expect(screen.getByText(/Adds/).textContent).toContain('0.5 kg');
      expect(screen.getByText('$1,040.00')).toBeTruthy();
      expect(screen.getByText(/For the whole quantity above, 500 g/)).toBeTruthy();
    });

    it('does not say anything about converting when the unit is the item\'s own', () => {
      setup({ qty: '2', baseTotal: '10', qtyUnit: 'kg' });
      expect(screen.queryByText(/to stock/)).toBeNull();
    });

    it('works for liquids, and for an item kept in grams', () => {
      setup({ material: { name: 'Milk', unit: 'l', initialStock: 1 }, qty: '250', qtyUnit: 'ml', baseTotal: '20' });
      expect(screen.getByText(/Adds/).textContent).toContain('0.25 l');
      expect(screen.getByText('$80.00')).toBeTruthy(); // 20 for a quarter litre
    });

    it('has no unit choice for a counted item', () => {
      setup({ material: { name: 'Eggs', unit: 'pcs', initialStock: 6 }, qty: '12', baseTotal: '84' });
      expect(screen.queryByLabelText('Unit of the quantity added')).toBeNull();
      expect(screen.getByText('$7.00')).toBeTruthy();
    });

    it('ignores a leftover unit that does not suit the item', () => {
      setup({ material: { name: 'Eggs', unit: 'pcs', initialStock: 6 }, qty: '12', baseTotal: '84', qtyUnit: 'kg' });
      expect(screen.getByText('$7.00')).toBeTruthy();
    });
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
