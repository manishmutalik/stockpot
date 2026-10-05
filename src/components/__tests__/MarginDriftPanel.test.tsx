import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MarginDriftPanel } from '../MarginDriftPanel';
import { marginDrift, pricingStamp } from '../../utils/pricing';

const SETTINGS: any = { gstApplicable: false };
const mats = (butter: number): any[] => [
  { id: 'butter', name: 'Butter', unit: 'kg', costPerUnit: butter, category: 'Raw Materials' },
  { id: 'flour', name: 'Flour', unit: 'kg', costPerUnit: 40, category: 'Raw Materials' },
];
const recipe = [{ materialId: 'butter', amount: 200, unit: 'g' }, { materialId: 'flour', amount: 500, unit: 'g' }]; // 120 at butter 500
const base: any = { id: 'cake', name: 'Cake', sellingPrice: 400, recipe };
const priced = (over: Record<string, any> = {}): any => ({ ...base, ...pricingStamp(base, mats(500), '2026-06-01'), ...over });

function show(item: any, butter: number, settings: any = SETTINGS) {
  const onUsePrice = vi.fn();
  const m = mats(butter);
  render(<MarginDriftPanel item={item} drift={marginDrift(item, m, settings)} materials={m} settings={settings} currencySymbol="₹" onUsePrice={onUsePrice} />);
  return { onUsePrice };
}

describe('MarginDriftPanel', () => {
  it('says when the price was set while the margin holds', () => {
    show(priced(), 500);
    expect(screen.getByText('Price set Mon 1 Jun')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('labels a baseline as tracking since, not as a price date', () => {
    show(priced({ pricingIsBaseline: true }), 500);
    expect(screen.getByText('Tracking margin since Mon 1 Jun')).toBeTruthy();
  });

  it('shows nothing for an unpriced or unstamped item', () => {
    const { container } = render(<MarginDriftPanel item={{ ...base, sellingPrice: 0 }} drift={null} materials={mats(500)} settings={SETTINGS} currencySymbol="₹" onUsePrice={vi.fn()} />);
    expect(container.textContent).toBe('');
    const second = render(<MarginDriftPanel item={base} drift={null} materials={mats(500)} settings={SETTINGS} currencySymbol="₹" onUsePrice={vi.fn()} />);
    expect(second.container.textContent).toBe('');
  });

  it('flags a slip with the margin before and after and the ingredient that moved', () => {
    show(priced(), 640); // butter +28%: cost 120 -> 148... margin 70 -> 63
    const badge = screen.getByRole('button', { expanded: false });
    expect(badge.textContent).toMatch(/Margin 70% → 63%/);
    expect(badge.textContent).toMatch(/Butter \+28%/);
  });

  it('expands to the drivers, and applies a restoring price in one tap', () => {
    const { onUsePrice } = show(priced(), 640);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByLabelText('What changed').textContent).toMatch(/Butter \+28%/);
    expect(screen.getByLabelText('What changed').textContent).toMatch(/\+₹28\.00 a unit/);
    fireEvent.click(screen.getByLabelText(/to restore your margin/));
    // cost 148 at a 70% margin = 493.33, rounded up to 495
    expect(onUsePrice).toHaveBeenCalledWith(495);
  });

  it('does not blame an ingredient for a recipe edit', () => {
    const edited = priced({ recipe: [{ materialId: 'butter', amount: 400, unit: 'g' }, ...recipe.slice(1)] }); // twice the butter, same price
    show(edited, 500);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.queryByLabelText('What changed')).toBeNull();
    expect(screen.getByText(/Recipe changes/).textContent).toMatch(/\+₹100\.00 a unit/);
    expect(screen.getByText(/not ingredient prices/)).toBeTruthy();
    expect(screen.getByRole('button', { expanded: true }).textContent).not.toMatch(/Butter/);
  });

  it('flags below target, and offers the target price as well', () => {
    const { onUsePrice } = show(priced({ targetMargin: 75 }), 500);
    const badge = screen.getByRole('button', { expanded: false });
    expect(badge.textContent).toMatch(/Margin 70%, under your 75% target/);
    fireEvent.click(badge);
    fireEvent.click(screen.getByLabelText(/to reach your target/));
    expect(onUsePrice).toHaveBeenCalledWith(480); // 120 / 0.25
  });

  it('offers the same price once when restoring the margin and reaching the target come to the same price', () => {
    // priced at a 70% margin (cost 120 at 400), butter now dearer; a 70% target gives the same price as restoring 70%
    const item = priced({ targetMargin: 70 });
    show(item, 640);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getAllByRole('button', { name: /^Use / })).toHaveLength(1);
  });
});
