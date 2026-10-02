import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsView } from '../SettingsView';

const makeProps = (over: Record<string, any> = {}) => ({
  settings: { name: 'Test Bakery', phone: '555', address: '1 Main St', logo: '', primaryColor: '#10b981', gstApplicable: false, gstRate: 5 },
  activeSettingsTab: 'bakery',
  currency: { code: 'INR', symbol: '₹' },
  setActiveSettingsTab: vi.fn(),
  updateSettingsField: vi.fn(),
  saveSettings: vi.fn(),
  showSaveFeedback: false,
  categories: ['Raw Materials', 'Packaging Materials'],
  addCategory: vi.fn(), deleteCategory: vi.fn(),
  user: { name: 'Asha', email: 'asha@example.com' },
  handleLogout: vi.fn(),
  billing: { status: 'active', currentPeriodEnd: null },
  openBillingPortal: vi.fn(), isOpeningPortal: false,
  shopifyStatus: { connected: false }, shopifyConfig: { hasEnvCredentials: true },
  shopifyShopInput: '', setShopifyShopInput: vi.fn(), isConnectingShopify: false,
  connectShopify: vi.fn(), disconnectShopify: vi.fn(),
  odooStatus: { connected: false },
  odooUrlInput: '', setOdooUrlInput: vi.fn(), odooDbInput: '', setOdooDbInput: vi.fn(),
  odooUsernameInput: '', setOdooUsernameInput: vi.fn(), odooPasswordInput: '', setOdooPasswordInput: vi.fn(),
  isConnectingOdoo: false, connectOdoo: vi.fn(), disconnectOdoo: vi.fn(),
  ...over,
}) as any;

describe('SettingsView', () => {
  it('lists the sections and switches between them', () => {
    const props = makeProps();
    render(<SettingsView {...props} />);
    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(nav.textContent).toContain('Business & GST');
    expect(screen.getByRole('button', { name: /Business & GST/ }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: /Integrations/ }));
    expect(props.setActiveSettingsTab).toHaveBeenCalledWith('integrations');
    fireEvent.click(screen.getByRole('button', { name: /Inventory Categories/ }));
    expect(props.setActiveSettingsTab).toHaveBeenCalledWith('categories');
  });

  it('saves from the header button and shows the saved banner', () => {
    const props = makeProps({ showSaveFeedback: true });
    render(<SettingsView {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/ }));
    expect(props.saveSettings).toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('Settings saved successfully!');
  });

  it('edits the business profile', () => {
    const props = makeProps();
    render(<SettingsView {...props} />);
    fireEvent.change(screen.getByLabelText('Business Name'), { target: { value: 'New Name' } });
    expect(props.updateSettingsField).toHaveBeenCalledWith('name', 'New Name');
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '999' } });
    expect(props.updateSettingsField).toHaveBeenCalledWith('phone', '999');
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: 'Elsewhere' } });
    expect(props.updateSettingsField).toHaveBeenCalledWith('address', 'Elsewhere');
  });

  it('reveals GST rate and pricing mode only when GST is on', () => {
    const props = makeProps();
    const { rerender } = render(<SettingsView {...props} />);
    expect(screen.queryByLabelText('GST Rate (%)')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'GST Applicable' }));
    expect(props.updateSettingsField).toHaveBeenCalledWith('gstApplicable', true);

    rerender(<SettingsView {...props} settings={{ ...props.settings, gstApplicable: true }} />);
    fireEvent.change(screen.getByLabelText('GST Rate (%)'), { target: { value: '18' } });
    expect(props.updateSettingsField).toHaveBeenCalledWith('gstRate', 18);
    fireEvent.change(screen.getByLabelText('Pricing Mode'), { target: { value: 'inclusive' } });
    expect(props.updateSettingsField).toHaveBeenCalledWith('gstPricingMode', 'inclusive');
  });

  describe('integrations', () => {
    it('flags Shopify as needing setup when the server has no credentials, and blocks connecting', () => {
      render(<SettingsView {...makeProps({ activeSettingsTab: 'integrations', shopifyConfig: { hasEnvCredentials: false } })} />);
      expect(screen.getByText('Setup required')).toBeTruthy();
      expect((screen.getByRole('button', { name: /Connect Store/ }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('connects a store and an Odoo instance', () => {
      const props = makeProps({ activeSettingsTab: 'integrations' });
      render(<SettingsView {...props} />);
      fireEvent.change(screen.getByLabelText('Shopify store name'), { target: { value: 'my-shop' } });
      expect(props.setShopifyShopInput).toHaveBeenCalledWith('my-shop');
      fireEvent.click(screen.getByRole('button', { name: /Connect Store/ }));
      expect(props.connectShopify).toHaveBeenCalled();
      fireEvent.change(screen.getByLabelText('Instance URL'), { target: { value: 'https://x.odoo.com' } });
      expect(props.setOdooUrlInput).toHaveBeenCalledWith('https://x.odoo.com');
      fireEvent.click(screen.getByRole('button', { name: /Connect Odoo/ }));
      expect(props.connectOdoo).toHaveBeenCalled();
    });

    it('shows connected integrations with a disconnect action and a count', () => {
      const props = makeProps({
        activeSettingsTab: 'integrations',
        shopifyStatus: { connected: true, shop: 'my-shop' },
        odooStatus: { connected: true, url: 'https://x.odoo.com' },
      });
      render(<SettingsView {...props} />);
      expect(screen.getByText('Linked to my-shop.myshopify.com')).toBeTruthy();
      expect(screen.getAllByText('2 connected')).toHaveLength(2); // side nav hint + section badge
      const disconnects = screen.getAllByRole('button', { name: /Disconnect/ });
      fireEvent.click(disconnects[0]);
      expect(props.disconnectShopify).toHaveBeenCalled();
      fireEvent.click(disconnects[1]);
      expect(props.disconnectOdoo).toHaveBeenCalled();
    });
  });

  it('picks a brand colour and removes a logo', () => {
    const props = makeProps({ activeSettingsTab: 'customisation', settings: { name: 'B', logo: 'data:image/png;base64,xx', primaryColor: '#00797B' } });
    render(<SettingsView {...props} />);
    fireEvent.click(screen.getByLabelText('Use #E4536B'));
    expect(props.updateSettingsField).toHaveBeenCalledWith('primaryColor', '#E4536B');
    expect(screen.getByLabelText('Use #00797B').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(props.updateSettingsField).toHaveBeenCalledWith('logo', '');
  });

  it('shows the account, billing state and sign out', () => {
    const props = makeProps({ activeSettingsTab: 'account' });
    render(<SettingsView {...props} />);
    expect(screen.getByText('asha@example.com')).toBeTruthy();
    expect(screen.getByText('active')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Manage Billing' }));
    expect(props.openBillingPortal).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Sign Out of Stockpot/ }));
    expect(props.handleLogout).toHaveBeenCalled();
  });

  it('says when there is no plan', () => {
    render(<SettingsView {...makeProps({ activeSettingsTab: 'account', billing: { status: 'none', currentPeriodEnd: null } })} />);
    expect(screen.getByText('No active plan')).toBeTruthy();
  });

  describe('categories', () => {
    it('adds a category from the button or Enter and clears the box', () => {
      const props = makeProps({ activeSettingsTab: 'categories' });
      render(<SettingsView {...props} />);
      const input = screen.getByLabelText('New category') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Dairy' } });
      fireEvent.click(screen.getByLabelText('Add category'));
      expect(props.addCategory).toHaveBeenCalledWith('Dairy');
      expect(input.value).toBe('');
      fireEvent.change(input, { target: { value: 'Spices' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(props.addCategory).toHaveBeenLastCalledWith('Spices');
    });

    it('lets every category but Raw Materials be deleted', () => {
      const props = makeProps({ activeSettingsTab: 'categories' });
      render(<SettingsView {...props} />);
      expect(screen.queryByLabelText('Delete Raw Materials')).toBeNull();
      fireEvent.click(screen.getByLabelText('Delete Packaging Materials'));
      expect(props.deleteCategory).toHaveBeenCalledWith('Packaging Materials');
    });
  });

  describe('payment fees', () => {
    it('shows each method\'s fee and saves an edit with the other rates kept', () => {
      const props = makeProps({ settings: { ...makeProps().settings, paymentFeeRates: { card: 2, upi: 0.5 } } });
      render(<SettingsView {...props} />);
      expect((screen.getByLabelText('Card fee (%)') as HTMLInputElement).value).toBe('2');
      expect((screen.getByLabelText('Cash fee (%)') as HTMLInputElement).value).toBe('');
      fireEvent.change(screen.getByLabelText('Card fee (%)'), { target: { value: '2.5' } });
      expect(props.updateSettingsField).toHaveBeenCalledWith('paymentFeeRates', { card: 2.5, upi: 0.5 });
    });

    it('clears a rate when the field is emptied, and never saves a negative one', () => {
      const props = makeProps({ settings: { ...makeProps().settings, paymentFeeRates: { card: 2, upi: 0.5 } } });
      render(<SettingsView {...props} />);
      fireEvent.change(screen.getByLabelText('Card fee (%)'), { target: { value: '' } });
      expect(props.updateSettingsField).toHaveBeenLastCalledWith('paymentFeeRates', { upi: 0.5 });
      fireEvent.change(screen.getByLabelText('Cash fee (%)'), { target: { value: '-4' } });
      expect(props.updateSettingsField).toHaveBeenLastCalledWith('paymentFeeRates', { card: 2, upi: 0.5, cash: 0 });
    });
  });

  describe('fixed monthly costs', () => {
    const costs = [{ id: 'r', name: 'Rent', monthlyAmount: 15000, startDate: '2026-01-01' }];
    const withCosts = () => makeProps({ settings: { ...makeProps().settings, fixedCosts: costs } });

    it('adds a blank cost', () => {
      const props = makeProps();
      render(<SettingsView {...props} />);
      fireEvent.click(screen.getByRole('button', { name: /Add a fixed cost/ }));
      const [key, value] = props.updateSettingsField.mock.calls.at(-1);
      expect(key).toBe('fixedCosts');
      expect(value).toEqual([{ id: expect.any(String), name: '', monthlyAmount: 0 }]);
    });

    it('shows a saved cost with its amount and dates', () => {
      render(<SettingsView {...withCosts()} />);
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Rent');
      expect((screen.getByLabelText(/Per month/) as HTMLInputElement).value).toBe('15000');
      expect((screen.getByLabelText(/From/) as HTMLInputElement).value).toBe('2026-01-01');
      expect((screen.getByLabelText(/Until/) as HTMLInputElement).value).toBe('');
    });

    it('edits the amount and sets an end date, leaving the rest alone', () => {
      const props = withCosts();
      render(<SettingsView {...props} />);
      fireEvent.change(screen.getByLabelText(/Per month/), { target: { value: '16000' } });
      expect(props.updateSettingsField).toHaveBeenLastCalledWith('fixedCosts', [{ ...costs[0], monthlyAmount: 16000 }]);
      fireEvent.change(screen.getByLabelText(/Until/), { target: { value: '2026-06-30' } });
      expect(props.updateSettingsField).toHaveBeenLastCalledWith('fixedCosts', [{ ...costs[0], endDate: '2026-06-30' }]);
    });

    it('clears an end date, and removes a cost', () => {
      const props = makeProps({ settings: { ...makeProps().settings, fixedCosts: [{ ...costs[0], endDate: '2026-06-30' }] } });
      render(<SettingsView {...props} />);
      fireEvent.change(screen.getByLabelText(/Until/), { target: { value: '' } });
      expect(props.updateSettingsField).toHaveBeenLastCalledWith('fixedCosts', [{ ...costs[0], endDate: undefined }]);
      fireEvent.click(screen.getByRole('button', { name: 'Remove Rent' }));
      expect(props.updateSettingsField).toHaveBeenLastCalledWith('fixedCosts', []);
    });
  });
});
