import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PriceHistoryModal, formatUnitCost } from '../PriceHistoryModal';
import type { PriceLogEntry } from '../../types';

const entry = (id: string, over: Partial<PriceLogEntry> = {}): PriceLogEntry => ({
  id, materialId: 'flour', date: '2026-03-10', unitCost: 45, unit: 'kg', source: 'restock', createdAt: 1, ...over,
});
const flour = { id: 'flour', name: 'Maida', unit: 'kg' };

describe('formatUnitCost', () => {
  it('shows cents for a normal price and keeps the digits of a per-gram price', () => {
    expect(formatUnitCost(45, '₹')).toBe('₹45.00');
    expect(formatUnitCost(1234.5, '₹')).toBe('₹1,234.50');
    expect(formatUnitCost(0.045, '₹')).toBe('₹0.045');
    expect(formatUnitCost(0.0452381, '₹')).toBe('₹0.0452');
  });
});

describe('PriceHistoryModal', () => {
  it('lists the material\'s prices newest first, with what was bought and why', () => {
    render(<PriceHistoryModal material={flour} currencySymbol="₹" onClose={vi.fn()} entries={[
      entry('a', { date: '2026-02-01', unitCost: 42, quantity: 50, source: 'initial', macAfter: 42 }),
      entry('b', { date: '2026-03-10', unitCost: 48, quantity: 20, source: 'restock', macAfter: 44 }),
      entry('x', { materialId: 'sugar', unitCost: 999 }),
    ]} />);
    expect(screen.getByRole('dialog', { name: /Price history: Maida/ })).toBeTruthy();
    const rows = screen.getAllByRole('row').slice(1); // without the header
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText(/48\.00/)).toBeTruthy();
    expect(within(rows[0]).getByText('Restock')).toBeTruthy();
    expect(within(rows[0]).getByText('20 kg')).toBeTruthy();
    expect(within(rows[1]).getAllByText(/42\.00/).length).toBeGreaterThan(0);
    expect(within(rows[1]).getByText('Opening cost')).toBeTruthy();
    expect(screen.queryByText(/999/)).toBeNull();
  });

  it('shows old entries in the unit the material is in now', () => {
    render(<PriceHistoryModal material={{ ...flour, unit: 'g' }} currencySymbol="₹" onClose={vi.fn()} entries={[entry('a', { unitCost: 45, unit: 'kg', quantity: 20 })]} />);
    const row = screen.getAllByRole('row')[1];
    expect(within(row).getByText(/0\.045/)).toBeTruthy();
    expect(within(row).getByText('20000 g')).toBeTruthy();
  });

  it('marks a missing quantity or average with a dash', () => {
    render(<PriceHistoryModal material={flour} currencySymbol="₹" onClose={vi.fn()} entries={[entry('a', { source: 'manual_edit' })]} />);
    expect(within(screen.getAllByRole('row')[1]).getAllByText('–')).toHaveLength(2);
    expect(screen.getByText('Edited by hand')).toBeTruthy();
  });

  it('explains an empty history', () => {
    render(<PriceHistoryModal material={flour} currencySymbol="₹" onClose={vi.fn()} entries={[]} />);
    expect(screen.getByText(/No prices recorded yet/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('closes from the button, the corner and the backdrop', () => {
    const onClose = vi.fn();
    const { container } = render(<PriceHistoryModal material={flour} currencySymbol="₹" onClose={onClose} entries={[]} />);
    const [corner, footer] = screen.getAllByRole('button', { name: 'Close' });
    fireEvent.click(corner);
    fireEvent.click(footer);
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.mouseDown(container.firstChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
