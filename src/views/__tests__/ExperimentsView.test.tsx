import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

const makeProps = (over: Record<string, any> = {}) => ({
  materials, experiments,
  currency: { code: 'USD', symbol: '$' },
  settings: { name: 'Test Bakery' },
  addExperiment: vi.fn(), updateExperiment: vi.fn(), deleteExperiment: vi.fn(),
  addMaterialToExperiment: vi.fn(), updateExperimentMaterial: vi.fn(), removeMaterialFromExperiment: vi.fn(),
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
});
