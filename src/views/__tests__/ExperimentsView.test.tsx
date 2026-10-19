import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExperimentsView } from '../ExperimentsView';

const ymd = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().split('T')[0]; };

const materials: any[] = [
  { id: 'flour', name: 'Flour', unit: 'kg', costPerUnit: 10 },
  { id: 'egg', name: 'Egg', unit: 'pcs', costPerUnit: 5 },
];
const experiments: any[] = [
  { id: 'a', name: 'Keto Starter', notes: 'hydration check', date: ymd(0), materials: [{ materialId: 'flour', amount: 500, unit: 'g' }, { materialId: 'egg', amount: 2, unit: 'pcs' }] },
  { id: 'b', name: 'Flax Binder', date: ymd(-90), materials: [{ materialId: 'flour', amount: 1, unit: 'kg' }] },
];

const menu = [
  { id: 'base', name: 'Sponge Base', sellingPrice: 0, notForSale: true, finishedGoodsStock: 6, recipe: [{ materialId: 'flour', amount: 200, unit: 'g' }] },
  { id: 'ganache', name: 'Ganache', sellingPrice: 0, notForSale: true, countedIn: 'kg', finishedGoodsStock: 1.5, recipe: [{ materialId: 'egg', amount: 4, unit: 'pcs' }] },
  { id: 'cookie', name: 'Cookie', sellingPrice: 5, finishedGoodsStock: 10, recipe: [] },
  { id: 'cake', name: 'Cake', sellingPrice: 30, madeToOrder: true, recipe: [] },
];

const makeProps = (over: Record<string, any> = {}) => ({
  materials, experiments, menu,
  currency: { code: 'USD', symbol: '$' },
  settings: { name: 'Test Bakery' },
  addExperiment: vi.fn(), updateExperiment: vi.fn(), deleteExperiment: vi.fn(),
  addMaterialToExperiment: vi.fn(), updateExperimentMaterial: vi.fn(), removeMaterialFromExperiment: vi.fn(),
  addPartToExperiment: vi.fn(), updateExperimentPart: vi.fn(), removePartFromExperiment: vi.fn(),
  restartExperimentPart: vi.fn(), setCountedIn: vi.fn().mockResolvedValue(true),
  ...over,
}) as any;

describe('ExperimentsView', () => {
  it('summarises sessions and costs', () => {
    render(<ExperimentsView {...makeProps()} />);
    expect(screen.getByText('R&D Sessions').nextElementSibling?.textContent).toBe('2');
    expect(screen.getByText('Trial Material Cost').nextElementSibling?.textContent).toBe('$25.00'); // 15 + 10
    expect(screen.getByText('Materials Tested').nextElementSibling?.textContent).toBe('2');
    expect(screen.getByText('$15.00 material cost')).toBeTruthy();
  });

  it('shows per-material cost with unit conversion', () => {
    render(<ExperimentsView {...makeProps()} />);
    expect(screen.getAllByText('$5.00').length).toBeGreaterThan(0); // 500 g of flour at $10/kg
  });

  it('keeps editing wired to the same handlers', () => {
    const props = makeProps();
    render(<ExperimentsView {...props} />);
    fireEvent.change(screen.getAllByLabelText('Session name')[0], { target: { value: 'Keto v2' } });
    expect(props.updateExperiment).toHaveBeenCalledWith('a', 'name', 'Keto v2');
    fireEvent.change(screen.getAllByLabelText('Session notes')[0], { target: { value: 'n' } });
    expect(props.updateExperiment).toHaveBeenCalledWith('a', 'notes', 'n');
    fireEvent.change(screen.getByLabelText('Amount of Egg'), { target: { value: '3' } });
    expect(props.updateExperimentMaterial).toHaveBeenCalledWith('a', 'egg', 3);
    fireEvent.click(screen.getByLabelText('Remove Egg'));
    expect(props.removeMaterialFromExperiment).toHaveBeenCalledWith('a', 'egg');
    fireEvent.change(screen.getAllByLabelText('Add material')[0], { target: { value: 'egg' } });
    expect(props.addMaterialToExperiment).toHaveBeenCalledWith('a', 'egg');
    fireEvent.click(screen.getAllByLabelText('Delete session')[0]);
    expect(props.deleteExperiment).toHaveBeenCalledWith('a');
    fireEvent.click(screen.getByRole('button', { name: /New R&D Session/ }));
    expect(props.addExperiment).toHaveBeenCalled();
  });

  it('lists newest first and searches name and notes', () => {
    render(<ExperimentsView {...makeProps()} />);
    const names = screen.getAllByLabelText('Session name').map(i => (i as HTMLInputElement).value);
    expect(names).toEqual(['Keto Starter', 'Flax Binder']);
    fireEvent.change(screen.getByLabelText('Search sessions'), { target: { value: 'hydration' } });
    expect(screen.getAllByLabelText('Session name')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Search sessions'), { target: { value: 'zzz' } });
    expect(screen.getByText('No sessions match this search.')).toBeTruthy();
  });

  it('shows the empty state only when there are no sessions at all', () => {
    const props = makeProps({ experiments: [] });
    render(<ExperimentsView {...props} />);
    expect(screen.getByText('No R&D sessions logged')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Log First R&D Session/ }));
    expect(props.addExperiment).toHaveBeenCalled();
  });

  it('adds bases and fillings, kept items only, in their own unit, costed and counted in the totals', () => {
    const withParts = [{ ...experiments[0], parts: [{ itemId: 'base', quantity: 2 }, { itemId: 'ganache', quantity: 0.25 }] }, experiments[1]];
    const props = makeProps({ experiments: withParts });
    render(<ExperimentsView {...props} />);
    // 15 of materials, 2 bases at $2 and 0.25 kg of ganache at $20/kg.
    expect(screen.getByText('$24.00 material cost')).toBeTruthy();
    expect(screen.getByText('Trial Material Cost').nextElementSibling?.textContent).toBe('$34.00');
    const picker = screen.getAllByLabelText('Add a base or filling')[0] as HTMLSelectElement;
    expect([...picker.querySelectorAll('optgroup')].map(g => g.label)).toEqual(['Bases and fillings', 'Menu']);
    expect([...picker.options].map(o => o.text)).not.toContain('Cake'); // made when ordered: no stock to take
    expect((picker.querySelector('option[value="base"]') as HTMLOptionElement).disabled).toBe(true);
    fireEvent.change(picker, { target: { value: 'cookie' } });
    expect(props.addPartToExperiment).toHaveBeenCalledWith('a', 'cookie');
    // Ganache is counted by weight: typed in grams.
    const ganache = screen.getByLabelText('Amount of Ganache') as HTMLInputElement;
    expect(ganache.value).toBe('250');
    fireEvent.change(ganache, { target: { value: '300' } });
    expect(props.updateExperimentPart).toHaveBeenCalledWith('a', 'ganache', 0.3);
    expect(screen.getByText('In stock: 6')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Remove Sponge Base'));
    expect(props.removePartFromExperiment).toHaveBeenCalledWith('a', 'base');
  });

  it('types an amount in g or kg, and counts a piece item by weight when g is chosen', async () => {
    const withParts = [{ ...experiments[0], parts: [{ itemId: 'base', quantity: 300 }, { itemId: 'ganache', quantity: 0.25 }] }];
    const props = makeProps({ experiments: withParts });
    render(<ExperimentsView {...props} />);
    const ganacheUnit = screen.getByLabelText('Unit of Ganache') as HTMLSelectElement;
    expect([...ganacheUnit.options].map(o => o.text)).toEqual(['pieces', 'g', 'kg', 'ml', 'litres']);
    expect(ganacheUnit.value).toBe('g');
    // kg only changes how it is typed.
    fireEvent.change(ganacheUnit, { target: { value: 'kg' } });
    expect((screen.getByLabelText('Amount of Ganache') as HTMLInputElement).value).toBe('0.25');
    fireEvent.change(screen.getByLabelText('Amount of Ganache'), { target: { value: '0.4' } });
    expect(props.updateExperimentPart).toHaveBeenLastCalledWith('a', 'ganache', 0.4);
    expect(props.setCountedIn).not.toHaveBeenCalled();
    // The base is counted in pieces: g counts it by weight, and the 300 typed is 300 g.
    expect((screen.getByLabelText('Unit of Sponge Base') as HTMLSelectElement).value).toBe('pcs');
    fireEvent.change(screen.getByLabelText('Unit of Sponge Base'), { target: { value: 'g' } });
    expect(props.setCountedIn).toHaveBeenCalledWith('base', 'kg');
    await waitFor(() => expect(props.restartExperimentPart).toHaveBeenCalledWith('a', 'base', 0.3));
  });

  it('leaves the amount alone when the unit change is not made', async () => {
    const props = makeProps({ experiments: [{ ...experiments[0], parts: [{ itemId: 'base', quantity: 2 }] }], setCountedIn: vi.fn().mockResolvedValue(false) });
    render(<ExperimentsView {...props} />);
    fireEvent.change(screen.getByLabelText('Unit of Sponge Base'), { target: { value: 'kg' } });
    await waitFor(() => expect(props.setCountedIn).toHaveBeenCalledWith('base', 'kg'));
    expect(props.restartExperimentPart).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Unit of Sponge Base') as HTMLSelectElement).value).toBe('pcs');
  });
});
