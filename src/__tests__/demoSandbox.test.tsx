import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// Runs the real App against an in-memory Firebase (see fakeFirebase.ts) so the
// sign-in -> seed -> render path is exercised end to end without a backend.
const fake = vi.hoisted(() => ({ current: null as any }));
vi.mock('../firebase', async () => {
  const { createFakeFirebase } = await import('./fakeFirebase');
  fake.current = createFakeFirebase();
  return fake.current.module;
});

import App from '../App';

beforeEach(() => {
  fake.current.reset();
  localStorage.clear();
  // No backend: billing/integration status calls just fail quietly.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
  (window as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const startDemo = async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /Explore Demo Sandbox/ }));
};

describe('Demo sandbox', () => {
  it('signs in, seeds demo data and opens every tab without crashing', async () => {
    await startDemo();

    await waitFor(
      () => expect([...fake.current.store.keys()].some((k: string) => k.endsWith('/menu/menu_croissant'))).toBe(true),
      { timeout: 5000 }
    );
    expect((await screen.findAllByText('Stockpot Demo Kitchen', {}, { timeout: 5000 })).length).toBeGreaterThan(0);

    for (const tab of ['Stock / Inventory', 'Orders', 'Production Runs', 'Recipes & Menus', 'R&D Lab', 'Wastage', 'Settings', 'Dashboard']) {
      fireEvent.click(screen.getAllByRole('button', { name: new RegExp(tab.replace(/[/&]/g, '.')) })[0]);
      await new Promise(r => setTimeout(r, 50));
      expect(screen.queryByText('Reload Application')).toBeNull();
    }
  }, 30000);

  it('seeds batches that still have stock with future expiry dates', async () => {
    await startDemo();
    await waitFor(() => expect([...fake.current.store.keys()].some((k: string) => k.includes('/productionRuns/'))).toBe(true), { timeout: 5000 });
    const today = new Date().toISOString().split('T')[0];
    const stocked = [...fake.current.store.entries()]
      .filter(([k]) => k.includes('/productionRuns/'))
      .map(([, v]) => v)
      .filter((r: any) => r.remainingQuantity > 0);
    expect(stocked.length).toBeGreaterThan(0);
    for (const r of stocked as any[]) expect(r.expiryDate >= today).toBe(true);
  });

  it('shows figures on every screen that add up to the data that was seeded', async () => {
    await startDemo();
    await waitFor(() => expect([...fake.current.store.keys()].some((k: string) => k.includes('/productionRuns/run_9'))).toBe(true), { timeout: 5000 });
    await screen.findAllByText('Stockpot Demo Kitchen', {}, { timeout: 5000 });

    const docs = (kind: string) => [...fake.current.store.entries()].filter(([k]) => k.includes(`/${kind}/`)).map(([, v]) => v as any);
    const [materials, menu, orders, runs, experiments] = ['materials', 'menu', 'orders', 'productionRuns', 'experiments'].map(docs);
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const money = (n: number) => `₹${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const valueOf = (label: string) => screen.getByText(label).nextElementSibling?.textContent;
    const open = async (nav: RegExp, heading: string) => {
      fireEvent.click(screen.getAllByRole('button', { name: nav })[0]);
      await screen.findByText(heading, {}, { timeout: 8000 });
    };

    // Production Runs
    await open(/Production Runs/, 'Production Runs & Finished Goods');
    expect(valueOf('Total Runs')).toBe(String(runs.length));
    expect(valueOf('Units Baked')).toBe(String(sum(runs.map((r: any) => r.quantityProduced))));
    expect(valueOf('Total Prod. Cost')).toBe(money(sum(runs.map((r: any) => r.costTotal))));
    expect(valueOf('Finished Goods')).toBe(String(menu.filter((m: any) => m.finishedGoodsStock > 0).length));
    expect(screen.getByText(`${sum(menu.map((m: any) => m.finishedGoodsStock))} units on shelf`)).toBeTruthy();

    // Orders (default range is the last 7 days, which covers every seeded order)
    await open(/Orders/, 'Customer & Courier Orders');
    const revenue = sum(orders.map((o: any) => menu.find((m: any) => m.id === o.menuItemId).sellingPrice * o.quantity - (o.discount || 0)));
    expect(valueOf('Total Orders')).toBe(String(orders.length));
    expect(valueOf('Revenue Booked')).toBe(money(revenue));
    expect(valueOf('Pending Fulfilment')).toBe(String(orders.filter((o: any) => !o.fulfilled).length));

    // Inventory: value = stock on hand (after the R&D session's projected use) x cost
    await open(/Stock \/ Inventory/, 'Raw Materials & Inventory');
    const projectedUse = (materialId: string) => sum(experiments.flatMap((e: any) => e.materials).filter((r: any) => r.materialId === materialId).map((r: any) => r.amount));
    const value = sum(materials.map((m: any) => Math.max(m.initialStock - projectedUse(m.id), 0) * m.costPerUnit));
    expect(screen.getByText('Raw Inventory Value').closest('div.surface-card')?.textContent).toContain(money(value));
    const low = materials.filter((m: any) => m.threshold > 0 && m.initialStock - projectedUse(m.id) <= m.threshold);
    expect(low.map((m: any) => m.name)).toEqual(['Instant Dry Yeast']);
    expect(screen.getByText('Under Threshold').closest('div.surface-card')?.textContent).toContain('1 SKU');

    // Dashboard (today): income - materials used = net profit
    await open(/Dashboard/, 'Performance Summary');
    const today = orders.filter((o: any) => !o.fulfilled);
    const income = sum(today.map((o: any) => menu.find((m: any) => m.id === o.menuItemId).sellingPrice * o.quantity));
    const cogs = sum(today.map((o: any) => {
      const item = menu.find((m: any) => m.id === o.menuItemId);
      return o.quantity * sum(item.recipe.map((r: any) => r.amount * materials.find((m: any) => m.id === r.materialId).costPerUnit));
    }));
    expect(screen.getByText('Cost of Goods Sold').nextElementSibling?.textContent).toBe(money(cogs));
    expect(screen.getByText('Net Profit').closest('div.surface-card')?.textContent).toContain(money(income - cogs));
  }, 60000);

  it('opens the Add Order and Log Production Run modals from the demo data', async () => {
    await startDemo();
    await screen.findAllByText('Stockpot Demo Kitchen', {}, { timeout: 5000 });

    fireEvent.click(screen.getAllByRole('button', { name: /Orders/ })[0]);
    fireEvent.click(await screen.findByRole('button', { name: /Add Order/ }, { timeout: 8000 }));
    expect(await screen.findByRole('dialog', { name: 'Add Order' }, { timeout: 5000 })).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Close'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add Order' })).toBeNull());

    fireEvent.click(screen.getAllByRole('button', { name: /Production Runs/ })[0]);
    await screen.findByText('Production Runs & Finished Goods', {}, { timeout: 8000 });
    fireEvent.click(await screen.findByRole('button', { name: /Log Production Run/ }));
    expect(await screen.findByRole('dialog', { name: 'Log Production Run' }, { timeout: 5000 })).toBeTruthy();
  }, 40000);

  it('says why when email/password sign-in is switched off for the project', async () => {
    fake.current.calls.failNextCreateUser = Object.assign(new Error('nope'), { code: 'auth/operation-not-allowed' });
    await startDemo();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/demo sandbox is unavailable/i);
    expect(alert.textContent).toMatch(/Email\/Password provider/);
    // still on the sign-in screen, and the button is usable again
    expect((screen.getByRole('button', { name: /Explore Demo Sandbox/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('signs the visitor back out if seeding the sample data fails after the account is created', async () => {
    const realCommit = fake.current.module.writeBatch;
    fake.current.module.writeBatch = () => ({
      set: () => {}, update: () => {}, delete: () => {},
      commit: async () => { throw Object.assign(new Error('denied'), { code: 'permission-denied' }); },
    });
    try {
      await startDemo();
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toMatch(/refused the write/);
      expect(fake.current.auth.currentUser).toBeNull();
      expect(screen.getByRole('button', { name: /Explore Demo Sandbox/ })).toBeTruthy();
    } finally {
      fake.current.module.writeBatch = realCommit;
    }
  });

  describe('ingredient price log', () => {
    const logs = () => [...fake.current.store.entries()].filter(([k]) => k.includes('/priceLog/')).map(([, v]) => v as any);
    const openInventory = async () => {
      await startDemo();
      await waitFor(() => expect([...fake.current.store.keys()].some((k: string) => k.includes('/productionRuns/run_9'))).toBe(true), { timeout: 5000 });
      await screen.findAllByText('Stockpot Demo Kitchen', {}, { timeout: 5000 });
      fireEvent.click(screen.getAllByRole('button', { name: /Stock \/ Inventory/ })[0]);
      await screen.findByText('Raw Materials & Inventory', {}, { timeout: 8000 });
    };

    it('seeds a price history for every material', async () => {
      await startDemo();
      await waitFor(() => expect(logs().length).toBeGreaterThan(0), { timeout: 5000 });
      const materials = [...fake.current.store.entries()].filter(([k]) => k.includes('/materials/')).map(([, v]) => v as any);
      for (const m of materials) expect(logs().some(l => l.materialId === m.id)).toBe(true);
    });

    it('records the price paid when something is restocked, and shows it in the history', async () => {
      await openInventory();
      const before = logs().filter(l => l.materialId === 'm_flour').length;
      fireEvent.click(screen.getByRole('button', { name: 'Restock Maida (All-Purpose Flour)' }));
      fireEvent.change(await screen.findByLabelText(/Quantity added/), { target: { value: '10000' } });
      fireEvent.change(screen.getByLabelText('Total price paid'), { target: { value: '520' } });
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Restock' }));
      await waitFor(() => expect(logs().filter(l => l.materialId === 'm_flour' && l.source === 'restock')).toHaveLength(1), { timeout: 5000 });
      expect(logs().filter(l => l.materialId === 'm_flour')).toHaveLength(before + 1);
      const entry = logs().find(l => l.materialId === 'm_flour' && l.unitCost === 0.052)!;
      expect(entry).toMatchObject({ unit: 'g', quantity: 10000, source: 'restock' });
      expect(entry.macAfter).toBeGreaterThan(0.045);
      expect(entry.macAfter).toBeLessThan(0.052);

      fireEvent.click(screen.getByRole('button', { name: 'Price history of Maida (All-Purpose Flour)' }));
      const dialog = await screen.findByRole('dialog', { name: /Price history: Maida/ });
      expect(dialog.textContent).toContain('0.052');
      expect(dialog.textContent).toContain('10000 g');
    }, 30000);

    it('lets a restock be typed in kilos for an item kept in grams, and shows no GST while GST is off', async () => {
      await openInventory();
      fireEvent.click(screen.getByRole('button', { name: 'Restock Maida (All-Purpose Flour)' }));
      const dialog = within(await screen.findByRole('dialog', { name: /Restock Maida/ }));
      expect(dialog.queryByText(/GST/)).toBeNull();
      fireEvent.change(dialog.getByLabelText('Unit of the quantity added'), { target: { value: 'kg' } });
      fireEvent.change(dialog.getByLabelText(/Quantity added/), { target: { value: '10' } });
      fireEvent.change(dialog.getByLabelText('Total price paid'), { target: { value: '520' } });
      expect(dialog.getByText(/Adds/).textContent).toContain('10000 g');
      fireEvent.click(dialog.getByRole('button', { name: 'Confirm Restock' }));
      await waitFor(() => expect(logs().filter(l => l.materialId === 'm_flour' && l.source === 'restock')).toHaveLength(1), { timeout: 5000 });
      expect(logs().find(l => l.materialId === 'm_flour' && l.source === 'restock')).toMatchObject({ unit: 'g', unitCost: 0.052, quantity: 10000 });
    }, 30000);

    it('starts a new material\'s history when it is added with a cost, and not when it has none', async () => {
      await openInventory();
      const add = async (name: string, cost: string) => {
        fireEvent.click(screen.getAllByRole('button', { name: /Add Item/ })[0]);
        const dialog = within(await screen.findByRole('dialog'));
        fireEvent.change(dialog.getByLabelText(/Item name/), { target: { value: name } });
        if (cost) fireEvent.change(dialog.getByLabelText(/Cost per unit/), { target: { value: cost } });
        fireEvent.change(dialog.getByLabelText('Initial stock'), { target: { value: '5' } });
        fireEvent.click(dialog.getByRole('button', { name: /Add Item/ }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 5000 });
      };
      await add('Saffron', '300');
      await add('Tap Water', '');
      const mats = [...fake.current.store.entries()].filter(([k]) => k.includes('/materials/')).map(([, v]) => v as any);
      const saffron = mats.find(m => m.name === 'Saffron'), water = mats.find(m => m.name === 'Tap Water');
      expect(saffron).toBeTruthy();
      expect(water).toBeTruthy();
      expect(logs().filter(l => l.materialId === saffron.id)).toEqual([expect.objectContaining({ unitCost: 300, quantity: 5, macAfter: 300, source: 'initial' })]);
      expect(logs().some(l => l.materialId === water.id)).toBe(false);
    }, 30000);

    it('records one entry for a cost edited by hand, once the typing has stopped', async () => {
      await openInventory();
      const before = logs().length;
      const input = screen.getByLabelText('Cost per unit of Maida (All-Purpose Flour)');
      for (const v of ['5', '50', '0.05']) fireEvent.change(input, { target: { value: v } });
      expect(logs()).toHaveLength(before); // nothing yet: still typing
      await waitFor(() => expect(logs()).toHaveLength(before + 1), { timeout: 4000 });
      expect(logs().find(l => l.source === 'manual_edit')).toMatchObject({ materialId: 'm_flour', unit: 'g', unitCost: 0.05 });
    }, 30000);
  });

  it('shows what each product sold and made on the Menu screen, matching the seeded orders', async () => {
    await startDemo();
    await waitFor(() => expect([...fake.current.store.keys()].some((k: string) => k.includes('/productionRuns/run_9'))).toBe(true), { timeout: 5000 });
    await screen.findAllByText('Stockpot Demo Kitchen', {}, { timeout: 5000 });
    const orders = [...fake.current.store.entries()].filter(([k]) => k.includes('/orders/')).map(([, v]) => v as any);
    fireEvent.click(screen.getAllByRole('button', { name: /Recipes . Menus/ })[0]);
    const sales = await screen.findByRole('group', { name: 'Sales of Butter Croissant' }, { timeout: 8000 });
    const units = orders.filter(o => o.menuItemId === 'menu_croissant').reduce((n, o) => n + o.quantity, 0);
    expect(sales.textContent).toContain(`${units} units`);
    const revenue = orders.filter(o => o.menuItemId === 'menu_croissant').reduce((n, o) => n + o.unitPriceAtSale * o.quantity - (o.discount || 0), 0);
    expect(sales.textContent).toContain(revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  }, 30000);
});
