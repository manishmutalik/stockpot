import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { CustomersPanel } from '../CustomersPanel';
import type { CustomerProfile } from '../../utils/customers';

const money = (n: number) => `₹${n.toFixed(2)}`;
const customer = (over: Partial<CustomerProfile> = {}): CustomerProfile => ({
  key: 'phone:9845010101', label: 'C-AAAA', name: 'Priya Sharma', phone: '+91 98450 10101', hasPhone: true,
  firstOrder: '2026-05-01', lastOrder: '2026-06-20', orderCount: 5, totalSpent: 2500, totalContribution: 1800, daysSinceLastOrder: 10,
  medianDaysBetweenOrders: 7, favouriteItems: ['Chocolate Cake', 'Cookie'], status: 'due', estimated: false, ...over,
});
const open = () => fireEvent.click(screen.getByRole('button', { name: /Customers/ }));
const list = () => screen.getByRole('list');

describe('CustomersPanel', () => {
  it('shows nothing when there are no customers', () => {
    const { container } = render(<CustomersPanel customers={[]} money={money} />);
    expect(container.innerHTML).toBe('');
  });

  it('starts collapsed, with the counts in its header', () => {
    render(<CustomersPanel customers={[customer(), customer({ key: 'b', name: 'B', status: 'lapsed' }), customer({ key: 'c', name: 'C', status: 'active' })]} money={money} />);
    expect(screen.getByRole('button', { name: /Customers/ }).textContent).toMatch(/3 customers · 1 due · 1 lapsed/);
    expect(screen.queryByRole('list')).toBeNull();
    open();
    expect(screen.getByRole('list')).toBeTruthy();
  });

  it('opens on Due, with tab counts, and switches to Lapsed and All', () => {
    render(<CustomersPanel customers={[customer({ name: 'Due One' }), customer({ key: 'b', name: 'Gone One', status: 'lapsed' }), customer({ key: 'c', name: 'Active One', status: 'active' })]} money={money} />);
    open();
    expect(screen.getByRole('tab', { name: /Due/ }).getAttribute('aria-selected')).toBe('true');
    expect(within(list()).getByText('Due One')).toBeTruthy();
    expect(within(list()).queryByText('Gone One')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /Lapsed/ }));
    expect(within(list()).getByText('Gone One')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /All/ }));
    expect(within(list()).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list()).getByText('Active')).toBeTruthy(); // the status tag appears on All
  });

  it('shows when they last ordered, their usual gap, orders, favourite items and what was made on them', () => {
    render(<CustomersPanel customers={[customer()]} money={money} />);
    open();
    const row = within(screen.getByRole('listitem'));
    expect(row.getByText(/Last order 20 Jun \(10 days ago\) · Every ~7 days · 5 orders/)).toBeTruthy();
    expect(row.getByText('Usually orders Chocolate Cake, Cookie')).toBeTruthy();
    expect(row.getByText('₹1800.00')).toBeTruthy();
  });

  it('says so when there is not enough history for a usual gap, and marks estimates', () => {
    render(<CustomersPanel customers={[customer({ medianDaysBetweenOrders: null, estimated: true, daysSinceLastOrder: 0, orderCount: 1 })]} money={money} />);
    open();
    const row = within(screen.getByRole('listitem'));
    expect(row.getByText(/Not enough orders yet/)).toBeTruthy();
    expect(row.getByText(/today/)).toBeTruthy();
    expect(row.getByText(/made on them \(est\.\)/)).toBeTruthy();
  });

  it('links each customer to a WhatsApp message with their favourite item, naming the business', () => {
    render(<CustomersPanel customers={[customer()]} money={money} businessName="Asha Bakes" />);
    open();
    const link = screen.getByRole('link', { name: 'Send a WhatsApp message to Priya Sharma' }) as HTMLAnchorElement;
    expect(link.href.startsWith('https://wa.me/919845010101?text=')).toBe(true);
    expect(decodeURIComponent(link.href.split('text=')[1])).toBe('Hi Priya, shall I keep Chocolate Cake for you this week? - Asha Bakes');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
  });

  it('does not offer WhatsApp for a customer with no phone, and marks them', () => {
    render(<CustomersPanel customers={[customer({ phone: undefined, hasPhone: false, key: 'name:x' })]} money={money} />);
    open();
    const row = within(screen.getByRole('listitem'));
    expect(row.queryByRole('link')).toBeNull();
    expect(row.getAllByText('No phone').length).toBe(2); // the tag and the disabled button
  });

  it('explains an empty list', () => {
    render(<CustomersPanel customers={[customer({ status: 'active' })]} money={money} />);
    open();
    expect(screen.getByText('Nobody is due for a reorder right now.')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Lapsed/ }));
    expect(screen.getByText('No lapsed customers.')).toBeTruthy();
  });

  it('shows a page at a time', () => {
    const many = Array.from({ length: 20 }, (_, i) => customer({ key: `k${i}`, name: `Customer ${String(i).padStart(2, '0')}`, daysSinceLastOrder: 100 - i }));
    render(<CustomersPanel customers={many} money={money} />);
    open();
    expect(within(list()).getAllByRole('listitem')).toHaveLength(15);
    fireEvent.click(screen.getByRole('button', { name: /Show 5 more of 5/ }));
    expect(within(list()).getAllByRole('listitem')).toHaveLength(20);
    expect(screen.queryByRole('button', { name: /Show .* more/ })).toBeNull();
  });
});
