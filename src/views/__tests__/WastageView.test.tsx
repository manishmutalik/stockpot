import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WastageView } from '../WastageView';

const materials: any[] = [{ id: 'flour', name: 'Jowar Flour', unit: 'kg' }];
const menu: any[] = [{ id: 'bread', name: 'Almond Bread' }];
const logs: any[] = [
  { id: '1', type: 'material', itemId: 'flour', quantity: 0.45, cost: 66.7, date: '2026-03-10', reason: 'Expired' },
  { id: '2', type: 'recipe', itemId: 'bread', quantity: 1, cost: 140, date: '2026-03-08', reason: 'Sampling' },
  { id: '3', type: 'recipe', itemId: 'gone', quantity: 2, cost: 20, date: '2026-03-01', reason: 'Expired' },
];

const makeProps = (over: Record<string, any> = {}) => ({
  materials, menu, wastageLogs: logs,
  productionRuns: [{ costTotal: 2267.4 }],
  currency: { code: 'USD', symbol: '$' },
  settings: { name: 'Test Bakery' },
  ...over,
}) as any;

describe('WastageView', () => {
  it('summarises the ledger', () => {
    render(<WastageView {...makeProps()} />);
    expect(screen.getByText('Total Recorded Loss').nextElementSibling?.textContent).toBe('$226.70');
    expect(screen.getByText('3 Entries')).toBeTruthy();
    expect(screen.getByText('1 raw material')).toBeTruthy();
    expect(screen.getByText('2 finished')).toBeTruthy();
    expect(screen.getByText('Loss vs Production').nextElementSibling?.textContent).toBe('10.00%');
    // Sampling is the biggest single reason (140 of 226.70 = 62%)
    expect(screen.getByText('Primary Waste Reason').nextElementSibling?.textContent).toBe('Sampling');
  });

  it('resolves item names and units, falling back for deleted items', () => {
    render(<WastageView {...makeProps()} />);
    expect(screen.getByText('Jowar Flour')).toBeTruthy();
    expect(screen.getByText('Almond Bread')).toBeTruthy();
    expect(screen.getByText('Unknown Item')).toBeTruthy();
    expect(screen.getByText('$148.22')).toBeTruthy(); // 66.7 / 0.45 per kg
  });

  it('filters by type tab, reason, search and date', () => {
    render(<WastageView {...makeProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Raw Materials/ }));
    expect(screen.getByText('1 of 3', { exact: false })).toBeTruthy();
    expect(screen.queryByText('Almond Bread')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^All Types/ }));

    fireEvent.change(screen.getByLabelText('Filter by reason'), { target: { value: 'Expired' } });
    expect(screen.queryByText('Almond Bread')).toBeNull();
    expect(screen.getByText('Jowar Flour')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    fireEvent.change(screen.getByLabelText('Search wastage'), { target: { value: 'almond' } });
    expect(screen.getByText('Almond Bread')).toBeTruthy();
    expect(screen.queryByText('Jowar Flour')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-03-05' } });
    expect(screen.queryByText('Unknown Item')).toBeNull();
    expect(screen.getByText('Almond Bread')).toBeTruthy();
  });

  it('says so when filters match nothing, and when nothing is logged', () => {
    const { rerender } = render(<WastageView {...makeProps()} />);
    fireEvent.change(screen.getByLabelText('Search wastage'), { target: { value: 'zzz' } });
    expect(screen.getByText('No entries match these filters.')).toBeTruthy();
    rerender(<WastageView {...makeProps({ wastageLogs: [] })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('No wastage logged yet. Great job!')).toBeTruthy();
  });

  it('paginates long ledgers', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: `w${i}`, type: 'material', itemId: 'flour', quantity: 1, cost: 1, date: `2026-03-${String(20 - i).padStart(2, '0')}`, reason: 'Spill',
    }));
    render(<WastageView {...makeProps({ wastageLogs: many })} />);
    expect(screen.getAllByText('Jowar Flour')).toHaveLength(15);
    fireEvent.click(screen.getByLabelText('Next page'));
    expect(screen.getAllByText('Jowar Flour')).toHaveLength(5);
  });

  it('shows the loss-by-reason breakdown', () => {
    render(<WastageView {...makeProps()} />);
    expect(screen.getByText('Loss by Reason')).toBeTruthy();
    expect(screen.getByText('Loss by Reason').closest('div.surface-card')?.textContent).toContain('62%');
  });
});
