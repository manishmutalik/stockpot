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
    financials: { income: 1000, orderExpenses: 250, deliveryExpenses: 100, wastageExpenses: 50, experimentExpenses: 0, gstCollected: 0, gstPaid: 0, profit: 600, trueProfit: 600, avgOrderContribution: 0, orderCount: 0, fixedCosts: 0, paymentFees: 0, discounts: 0, unpaidIncome: 0 },
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

describe('SummaryView pre-orders', () => {
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })();
  const pre = (over: Record<string, any> = {}) => ({ id: 'p1', menuItemId: 'cake', quantity: 3, date: tomorrow, preorder: true, stockClaimed: false, ...over });

  it('shows what to prepare, and opens the Upcoming list in Orders', () => {
    const openUpcomingOrders = vi.fn();
    render(<SummaryView {...makeProps({ orders: [pre()], openUpcomingOrders, settings: { name: 'Test Bakery', gstApplicable: false, timezone: 'UTC' } })} />);
    const card = screen.getByRole('region', { name: 'Pre-orders due' });
    expect(card.textContent).toContain('Cake × 3');
    fireEvent.click(screen.getByRole('button', { name: 'View in Orders' }));
    expect(openUpcomingOrders).toHaveBeenCalled();
  });

  it('does not show the card with no pre-orders, and does not count a pre-order due later in the dashboard\'s orders', () => {
    render(<SummaryView {...makeProps({ orders: [pre({ date: daysAgo(-9) })], settings: { name: 'Test Bakery', gstApplicable: false, timezone: 'UTC' } })} />);
    expect(screen.queryByRole('region', { name: 'Pre-orders due' })).toBeNull();
  });
});

describe('SummaryView repricing card', () => {
  const mats: any[] = [{ id: 'butter', name: 'Butter', unit: 'kg', initialStock: 9, costPerUnit: 900, category: 'Raw Materials', dateAdded: '2026-01-01' }];
  const item = { id: 'cake', name: 'Cake', sellingPrice: 400, recipe: [{ materialId: 'butter', amount: 200, unit: 'g' }], pricedAt: '2026-06-01', costAtPricing: 100, materialCostsAtPricing: { butter: 500 } };

  it('says how many items need repricing, and opens the Menu on them', () => {
    const openRepricing = vi.fn();
    render(<SummaryView {...makeProps({ materials: mats, menu: [item], openRepricing })} />);
    expect(screen.getByRole('region', { name: 'Items needing repricing' }).textContent).toContain('1 item needs repricing');
    fireEvent.click(screen.getByRole('button', { name: 'View in Menu' }));
    expect(openRepricing).toHaveBeenCalled();
  });

  it('is absent while margins hold', () => {
    render(<SummaryView {...makeProps({ materials: [{ ...mats[0], costPerUnit: 500 }], menu: [item] })} />);
    expect(screen.queryByRole('region', { name: 'Items needing repricing' })).toBeNull();
  });
});

describe('SummaryView (dashboard)', () => {
  /** A line of the sales-to-true-profit breakdown, by its label. */
  const row = (label: string) => [...screen.getByRole('region', { name: 'From sales to true profit' }).querySelectorAll('li')]
    .find(li => li.querySelector('div > div')?.textContent?.replace(/^[−+=]\s*/, '') === label)!;

  it('headlines true profit, as a share of sales, with thousands separators', () => {
    render(<SummaryView {...makeProps({ financials: { income: 5171.19, orderExpenses: 1243.97, deliveryExpenses: 737, wastageExpenses: 66.7, experimentExpenses: 0, gstCollected: 0, gstPaid: 0, profit: 3123.52, trueProfit: 2900, avgOrderContribution: 312.35, orderCount: 10, fixedCosts: 223.52, paymentFees: 0 } })} />);
    expect(screen.getByTestId('true-profit').textContent).toBe('$2,900.00');
    // Rounded the same way as the breakdown's own shares, so the card and the last line agree.
    expect(screen.getAllByText('56% of sales')).toHaveLength(2);
    expect(screen.getByText('Profit before overheads', { selector: 'span' }).parentElement?.textContent).toContain('$3,123.52');
  });

  it('steps from sales to true profit, one cost at a time, each with its share of sales', () => {
    render(<SummaryView {...makeProps({ financials: { ...makeProps().financials, paymentFees: 30, fixedCosts: 90, profit: 600, trueProfit: 480 } })} />);
    expect(row('Ingredients and packaging').textContent).toContain('−$250.00');
    expect(row('Ingredients and packaging').textContent).toContain('25% of sales');
    expect(row('Courier fees').textContent).toContain('−$100.00');
    expect(row('Wastage').textContent).toContain('−$50.00');
    expect(row('Profit before overheads').textContent).toContain('$600.00');
    expect(row('Payment fees').textContent).toContain('−$30.00');
    expect(row('Fixed costs').textContent).toContain('−$90.00');
    expect(row('True profit').textContent).toContain('$480.00');
    const labels = [...screen.getByRole('region', { name: 'From sales to true profit' }).querySelectorAll('li')].map(li => li.textContent ?? '');
    expect(labels.findIndex(t => t.includes('Profit before overheads'))).toBeLessThan(labels.findIndex(t => t.includes('Fixed costs')));
  });

  it('shows a cost under 1% of sales as "<1%", not "0%"', () => {
    render(<SummaryView {...makeProps({ financials: { ...makeProps().financials, paymentFees: 3, profit: 600, trueProfit: 597 } })} />);
    expect(row('Payment fees').textContent).toContain('<1% of sales');
  });

  it('leaves out costs that are nothing, and says when no fixed costs are set, with a way to add them', () => {
    const setActiveTab = vi.fn(), setActiveSettingsTab = vi.fn();
    render(<SummaryView {...makeProps({ setActiveTab, setActiveSettingsTab, settings: { name: 'T', gstApplicable: false, fixedCosts: [] } })} />);
    expect(screen.queryByText('Payment fees')).toBeNull();
    expect(screen.queryByText('Fixed costs', { selector: 'div' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add them in Settings' }));
    expect(setActiveSettingsTab).toHaveBeenCalledWith('bakery');
    expect(setActiveTab).toHaveBeenCalledWith('settings');
  });

  it('counts a multi-item order group as one courier delivery', () => {
    const orders = [
      { id: 'a', menuItemId: 'cake', quantity: 1, date: today, deliveryMethod: 'third_party', orderGroupId: 'g1' },
      { id: 'b', menuItemId: 'cake', quantity: 2, date: today, deliveryMethod: 'third_party', orderGroupId: 'g1' },
      { id: 'c', menuItemId: 'cake', quantity: 1, date: today, deliveryMethod: 'pickup' },
    ];
    render(<SummaryView {...makeProps({ orders })} />);
    expect(row('Courier fees').textContent).toContain('1 delivery');
  });

  it('shows what was spent making stock in the production card, and says it is not taken off twice', () => {
    const productionRuns = [{ id: 'r1', recipeId: 'cake', quantityProduced: 10, quantityYield: 10, remainingQuantity: 10, date: today, costTotal: 80, createdAt: 1 }];
    render(<SummaryView {...makeProps({ productionRuns })} />);
    expect(screen.getByText('spent making stock', { exact: false }).textContent).toContain('$80.00');
    expect(screen.getByText(/not taken off profit twice/)).toBeTruthy();
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

  describe('true profit card', () => {
    const rich = { ...makeProps().financials, income: 1000, profit: 600, trueProfit: 480, avgOrderContribution: 120, orderCount: 4, fixedCosts: 90, paymentFees: 30, discounts: 50, unpaidIncome: 200 };
    it('shows true profit, profit before overheads and the average each order made', () => {
      render(<SummaryView {...makeProps({ financials: rich })} />);
      expect(screen.getByTestId('true-profit').textContent).toBe('$480.00');
      expect(screen.getByText('Average per order', { selector: 'span' }).parentElement?.textContent).toContain('$120.00');
      expect(screen.getByText(/4 orders, before fixed costs/)).toBeTruthy();
    });
    it('says what sales are after when there were discounts', () => {
      render(<SummaryView {...makeProps({ financials: rich })} />);
      expect(screen.getByText('After $50.00 of discounts')).toBeTruthy();
    });
    it('says how much of the income is still unpaid', () => {
      render(<SummaryView {...makeProps({ financials: rich })} />);
      expect(screen.getByText('Includes $200.00 not yet paid')).toBeTruthy();
    });
    it('shows a loss in coral', () => {
      render(<SummaryView {...makeProps({ financials: { ...rich, trueProfit: -120 } })} />);
      expect(screen.getByTestId('true-profit').textContent).toBe('-$120.00');
      expect(screen.getByTestId('true-profit').className).toContain('text-coral');
    });
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
    it('labels sales as excluding GST when GST is on, since GST is never income, and shows GST apart', () => {
      render(<SummaryView {...makeProps({ settings: { name: 'T', gstApplicable: true } })} />);
      expect(screen.getAllByText('Sales (excl. GST)').length).toBeGreaterThan(0);
      expect(screen.getByText('GST Collected')).toBeTruthy();
    });
    it('just says "Sales" when GST is off', () => {
      render(<SummaryView {...makeProps()} />);
      expect(screen.getAllByText('Sales').length).toBeGreaterThan(0);
      expect(screen.queryByText('GST Collected')).toBeNull();
    });
  });
});
