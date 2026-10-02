import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SummaryView } from '../SummaryView';

const today = new Date().toISOString().split('T')[0];
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]; };

const materials = [
  { id: 'flour', name: 'Bread Flour', unit: 'kg', initialStock: 3, costPerUnit: 55, category: 'Raw Materials', threshold: 5, dateAdded: '2026-01-01' },
];
const menu = [{ id: 'cake', name: 'Cake', sellingPrice: 100, recipe: [], finishedGoodsStock: 5 }];

function makeProps(overrides: Record<string, any> = {}) {
  return {
    materials,
    menu,
    orders: [],
    productionRuns: [],
    wastageLogs: [],
    summaryRange: 'monthly',
    summaryDateStart: daysAgo(29),
    summaryDateEnd: today,
    summaryRefDate: today,
    setSummaryDateStart: vi.fn(),
    setSummaryDateEnd: vi.fn(),
    handleRangeChange: vi.fn(),
    financials: { income: 1000, orderExpenses: 250, deliveryExpenses: 100, wastageExpenses: 50, experimentExpenses: 0, gstCollected: 0, gstPaid: 0, profit: 600 },
    chartData: [{ name: 'W1', income: 0, expenses: 0, profit: 0 }],
    currency: { code: 'USD', symbol: '$' },
    settings: { name: 'Test Bakery', gstApplicable: false },
    lowStockItems: [],
    lastSynced: new Date(),
    setActiveTab: vi.fn(),
    setIsProductionRunModalOpen: vi.fn(),
    setRestockMaterial: vi.fn(),
    ...overrides,
  } as any;
}

describe('SummaryView (dashboard)', () => {
  it('shows the headline figures with thousands separators and cost-as-share-of-income footers', () => {
    render(<SummaryView {...makeProps({ financials: { income: 5171.19, orderExpenses: 1243.97, deliveryExpenses: 737, wastageExpenses: 66.7, experimentExpenses: 0, gstCollected: 0, gstPaid: 0, profit: 3123.52 } })} />);
    expect(screen.getByText('$1,243.97')).toBeTruthy();
    expect(screen.getByText('$3,123.52')).toBeTruthy(); // net profit
    expect(screen.getByText('24.1% of income')).toBeTruthy(); // COGS / income
    expect(screen.getByText('60.4% margin')).toBeTruthy();
  });

  it('breaks net profit down into income minus COGS, couriers and wastage', () => {
    render(<SummaryView {...makeProps()} />);
    expect(screen.getByText('-$250.00')).toBeTruthy();
    expect(screen.getByText('-$100.00')).toBeTruthy();
    expect(screen.getByText('-$50.00')).toBeTruthy();
    expect(screen.getByText('60.0%')).toBeTruthy(); // retained bottomline
  });

  it('counts a multi-item order group as one courier delivery', () => {
    const orders = [
      { id: 'a', menuItemId: 'cake', quantity: 1, date: today, deliveryMethod: 'third_party', orderGroupId: 'g1' },
      { id: 'b', menuItemId: 'cake', quantity: 2, date: today, deliveryMethod: 'third_party', orderGroupId: 'g1' },
      { id: 'c', menuItemId: 'cake', quantity: 1, date: today, deliveryMethod: 'pickup' },
    ];
    render(<SummaryView {...makeProps({ orders })} />);
    expect(screen.getByText('1 delivery')).toBeTruthy();
  });

  it('lists low-stock materials and opens the restock flow for the real material record', () => {
    const setRestockMaterial = vi.fn();
    const lowStockItems = [{ ...materials[0], remaining: 3, used: 0 }];
    render(<SummaryView {...makeProps({ lowStockItems, setRestockMaterial })} />);
    expect(screen.getByText('Bread Flour')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Restock' }));
    expect(setRestockMaterial).toHaveBeenCalledWith(materials[0]);
  });

  it('shows a healthy state instead of a list when nothing is below threshold', () => {
    render(<SummaryView {...makeProps()} />);
    expect(screen.getByText('Every material is above its low-stock threshold.')).toBeTruthy();
  });

  it('flags an expired unsold batch in the freshness card and the recent-runs table', () => {
    const productionRuns = [
      { id: 'r1', recipeId: 'cake', quantityProduced: 10, quantityYield: 9, remainingQuantity: 4, date: daysAgo(5), expiryDate: daysAgo(2), costTotal: 80, createdAt: 1 },
    ];
    render(<SummaryView {...makeProps({ productionRuns })} />);
    expect(screen.getByText('Freshness')).toBeTruthy();
    expect(screen.getAllByText('Expired').length).toBeGreaterThan(0);
    expect(screen.getByText('90%')).toBeTruthy(); // yield: 9 of 10 sellable
  });

  it('only offers "Log Production Run" once there is a menu to bake from', () => {
    const { rerender } = render(<SummaryView {...makeProps({ menu: [] })} />);
    expect(screen.queryByRole('button', { name: /Log Production Run/ })).toBeNull();
    rerender(<SummaryView {...makeProps()} />);
    expect(screen.getByRole('button', { name: /Log Production Run/ })).toBeTruthy();
  });

  describe('estimated figures and GST labelling', () => {
    it('says so when some orders are valued at today\'s prices', () => {
      render(<SummaryView {...makeProps({ financials: { ...makeProps().financials, estimated: true } })} />);
      expect(screen.getByText(/valued at today's prices \(est\.\)/)).toBeTruthy();
    });
    it('says nothing when every order carries its own price and cost', () => {
      render(<SummaryView {...makeProps({ financials: { ...makeProps().financials, estimated: false } })} />);
      expect(screen.queryByText(/\(est\.\)/)).toBeNull();
    });
    it('labels income as excluding GST when GST is on, since GST is never income', () => {
      render(<SummaryView {...makeProps({ settings: { name: 'T', gstApplicable: true } })} />);
      expect(screen.getByText('Income (excl. GST)')).toBeTruthy();
      expect(screen.queryByText('Gross income')).toBeNull();
    });
    it('keeps the "Gross income" label when GST is off', () => {
      render(<SummaryView {...makeProps()} />);
      expect(screen.getByText('Gross income')).toBeTruthy();
    });
  });
});
