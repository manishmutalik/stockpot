import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { PriceReviewModal } from '../PriceReviewModal';

vi.mock('../MenuShareModal', () => ({ MenuShareModal: () => <div>The menu to share</div> }));

const materials: any[] = [{ id: 'butter', name: 'Butter', unit: 'kg', costPerUnit: 800 }];
const line = [{ materialId: 'butter', amount: 100, unit: 'g' }]; // cost 80
const priced = (id: string, over: Record<string, any> = {}): any => ({
  id, name: id, sellingPrice: 200, recipe: line, pricedAt: '2026-06-01', costAtPricing: 40, materialCostsAtPricing: { butter: 400 }, ...over,
});
const menu = [priced('Cake'), priced('Brownie')]; // margin 80% -> 60%: 80 / 0.2 = 400 restores it

function show(over: Record<string, any> = {}) {
  const onApply = vi.fn().mockResolvedValue(true);
  const onClose = vi.fn();
  render(<PriceReviewModal menu={menu} materials={materials} orders={[]} settings={{} as any} currency={{ code: 'INR', symbol: '₹' }} today="2026-11-02" onApply={onApply} onClose={onClose} {...over} />);
  return { onApply, onClose };
}
const row = (name: string) => within(screen.getByRole('group', { name }));

describe('PriceReviewModal', () => {
  it('lists each item with the facts and every price already recommended and ticked', () => {
    show();
    expect(screen.getByText('Time to raise prices')).toBeTruthy();
    expect(row('Cake').getByText(/Price now ₹200 · margin 80% → 60% · Butter/)).toBeTruthy();
    expect((row('Cake').getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    expect(row('Cake').getByRole('button', { name: 'Restore margin ₹400' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Changing 2 prices. Average rise 100%.')).toBeTruthy();
  });

  it('applies every ticked price with one tap', async () => {
    const { onApply } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(screen.getByText('Prices updated')).toBeTruthy());
    expect(onApply).toHaveBeenCalledWith([{ menuItemId: 'Cake', newPrice: 400 }, { menuItemId: 'Brownie', newPrice: 400 }]);
    expect(screen.getByText('Next price review 2 Feb')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Share updated menu' }));
    expect(screen.getByText('The menu to share')).toBeTruthy();
  });

  it('leaves out an unticked item, and treats Keep as unticked', async () => {
    const { onApply } = show();
    fireEvent.click(row('Cake').getByRole('checkbox'));
    expect(row('Cake').getByRole('button', { name: 'Keep ₹200' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Changing 1 price. Average rise 100%.')).toBeTruthy();
    fireEvent.click(row('Brownie').getByRole('button', { name: 'Keep ₹200' }));
    expect((row('Brownie').getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(row('Brownie').getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith([{ menuItemId: 'Brownie', newPrice: 400 }]));
  });

  it('takes a custom price', async () => {
    const { onApply } = show({ menu: [menu[0]] });
    fireEvent.click(row('Cake').getByRole('button', { name: 'Custom' }));
    expect((screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(row('Cake').getByLabelText('Custom price for Cake'), { target: { value: '275' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith([{ menuItemId: 'Cake', newPrice: 275 }]));
  });

  it('offers the target as well when it is a different price, and once when it is the same', () => {
    show({ menu: [priced('Cake', { targetMargin: 70 }), priced('Same', { targetMargin: 80 })] });
    expect(row('Cake').getByRole('button', { name: /Reach target ₹2/ })).toBeTruthy();
    expect(row('Same').queryByRole('button', { name: /Reach target/ })).toBeNull();
  });

  it('records the review with nothing changed when the owner keeps all prices', async () => {
    const { onApply, onClose } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Keep all prices for now' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onApply).toHaveBeenCalledWith([]);
  });

  it('says so and stays open when saving fails', async () => {
    const { onClose } = show({ onApply: vi.fn().mockResolvedValue(false) });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/no prices have changed/);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows what the margins cost a month only when there are sales to go by', () => {
    show();
    expect(screen.queryByText(/costing you about/)).toBeNull();
  });

  it('says what the margins cost a month from real sales', () => {
    const sale = { id: 'o', date: '2026-10-20', menuItemId: 'Cake', quantity: 30, unitPriceAtSale: 200, unitIngredientCostAtSale: 80, unitPackagingCostAtSale: 0, status: 'fulfilled', paymentStatus: 'paid' };
    show({ orders: [sale] });
    expect(screen.getByText(/These margins are costing you about ₹[\d,]+ a month/)).toBeTruthy();
  });
});
