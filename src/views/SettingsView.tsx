import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle, Building2, Check, CheckCircle2, Copy, Database, Globe, Image, Layers, LogOut, Palette,
  Percent, Plus, Puzzle, Save, Store, Trash2, User as UserIcon, UserCog
} from 'lucide-react';
import { AppViewProps } from '../types';

type SettingsTab = 'bakery' | 'integrations' | 'customisation' | 'account' | 'categories';

const LABEL = 'block font-mono text-[10px] font-semibold uppercase tracking-wider text-muted mb-1.5';
const FIELD =
  'w-full bg-stone-50 border border-transparent rounded-lg px-4 py-3 text-sm text-ink placeholder:text-muted/70 outline-none transition-colors focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary';

// Colour is only used on shared nutrition cards, so offer the brand palette
// (plus the previous default) rather than a wall of earth tones.
const BRAND_SWATCHES = ['#00797B', '#006143', '#1FA97A', '#10b981', '#2B313D', '#E4536B', '#F59E0B'];

/** A white card with an icon tile, title and subtitle, and the section's fields below. */
const Section: React.FC<{
  icon: React.ElementType;
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}> = ({ icon: Icon, title, subtitle, badge, children }) => (
  <section className="surface-card p-5 sm:p-7 space-y-6">
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
          <Icon size={20} />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-bold tracking-tight text-ink">{title}</h3>
          <p className="text-sm text-muted">{subtitle}</p>
        </div>
      </div>
      {badge}
    </div>
    {children}
  </section>
);

const Pill: React.FC<{ tone: 'green' | 'coral' | 'slate'; children: React.ReactNode }> = ({ tone, children }) => (
  <span
    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-mono text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${
      tone === 'green' ? 'bg-margin/10 text-[#006143]' : tone === 'coral' ? 'bg-coral/10 text-coral' : 'bg-stone-100 text-muted'
    }`}
  >
    {children}
  </span>
);

const Toggle: React.FC<{ checked: boolean; onChange: () => void; label: string }> = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={onChange}
    className={`relative w-14 h-8 rounded-full transition-colors shrink-0 ${checked ? 'bg-primary' : 'bg-stone-300'}`}
  >
    <span className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-0'}`} />
  </button>
);

export const SettingsView: React.FC<AppViewProps> = (props) => {
  const {
    shopifyStatus, shopifyConfig, shopifyShopInput, setShopifyShopInput, isConnectingShopify,
    connectShopify, disconnectShopify,
    odooStatus, odooUrlInput, setOdooUrlInput, odooDbInput, setOdooDbInput, odooUsernameInput,
    setOdooUsernameInput, odooPasswordInput, setOdooPasswordInput, isConnectingOdoo, connectOdoo, disconnectOdoo,
    updateSettingsField, categories, addCategory, deleteCategory, activeSettingsTab, setActiveSettingsTab,
    settings, user, saveSettings, showSaveFeedback, handleLogout, billing, openBillingPortal, isOpeningPortal
  } = props;

  const [newCategory, setNewCategory] = useState('');
  const submitCategory = () => {
    addCategory(newCategory);
    setNewCategory('');
  };

  const connectedCount = (shopifyStatus.connected ? 1 : 0) + (odooStatus.connected ? 1 : 0);
  const callbackUrl = `${window.location.origin}/api/auth/shopify/callback`;

  const tabs: { id: SettingsTab; label: string; hint?: string; icon: React.ElementType }[] = [
    { id: 'bakery', label: 'Business & GST', icon: Building2, hint: settings.gstApplicable ? 'GST on' : undefined },
    { id: 'integrations', label: 'Integrations', icon: Puzzle, hint: connectedCount > 0 ? `${connectedCount} connected` : undefined },
    { id: 'customisation', label: 'App Customisation', icon: Palette },
    { id: 'account', label: 'User Account', icon: UserCog },
    { id: 'categories', label: 'Inventory Categories', icon: Layers, hint: String(categories.length) },
  ];

  const billingOk = billing.status === 'active' || billing.status === 'trialing';

  return (
    <motion.div
      key="settings"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6 pb-20"
    >
      {/* Heading */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted mb-1">
            <span className="truncate">{settings.name || 'My Bakery'}</span>
            <span className="text-stone-300">/</span>
            <span className="text-primary font-semibold whitespace-nowrap">System Configuration</span>
          </div>
          <h2 className="text-2xl md:text-[32px] md:leading-tight font-bold tracking-tight text-ink">Settings</h2>
          <p className="text-sm text-muted mt-1 max-w-2xl">Manage your business profile, tax, integrations and preferences.</p>
        </div>
        <button
          onClick={saveSettings}
          className="h-10 flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white px-6 rounded-lg text-sm font-semibold shadow-sm transition-colors"
        >
          <Save size={18} />
          Save Changes
        </button>
      </div>

      {showSaveFeedback && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          role="status"
          className="bg-margin/10 p-4 rounded-xl flex items-center gap-3 text-[#006143]"
        >
          <CheckCircle2 size={20} />
          <p className="text-sm font-semibold">Settings saved successfully!</p>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[16rem_minmax(0,1fr)] gap-6 items-start">
        {/* Section navigation: a chip row on small screens, a side list from lg */}
        <nav aria-label="Settings sections" className="surface-card p-2 flex lg:flex-col gap-1 overflow-x-auto lg:sticky lg:top-4">
          {tabs.map(({ id, label, hint, icon: Icon }) => {
            const active = activeSettingsTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveSettingsTab(id)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors lg:w-full ${
                  active ? 'bg-primary text-white shadow-sm' : 'text-muted hover:bg-primary/5 hover:text-ink'
                }`}
              >
                <Icon size={18} className="shrink-0" />
                <span className="lg:flex-1 lg:text-left">{label}</span>
                {hint && (
                  <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-stone-100'}`}>{hint}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="space-y-6 min-w-0">
          {/* Business profile + GST */}
          {activeSettingsTab === 'bakery' && (
            <>
              <Section icon={Building2} title="Business Profile" subtitle="Identity and contact information">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="business-name" className={LABEL}>Business Name</label>
                    <input
                      id="business-name"
                      type="text"
                      value={settings.name}
                      onChange={(e) => updateSettingsField('name', e.target.value)}
                      className={FIELD}
                      placeholder="The Sourdough Loft"
                    />
                  </div>
                  <div>
                    <label htmlFor="business-phone" className={LABEL}>Phone Number</label>
                    <input
                      id="business-phone"
                      type="text"
                      value={settings.phone}
                      onChange={(e) => updateSettingsField('phone', e.target.value)}
                      className={FIELD}
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor="business-address" className={LABEL}>Address</label>
                    <input
                      id="business-address"
                      type="text"
                      value={settings.address}
                      onChange={(e) => updateSettingsField('address', e.target.value)}
                      className={FIELD}
                      placeholder="123 Flour St, Bread City"
                    />
                  </div>
                </div>
              </Section>

              <Section
                icon={Percent}
                title="GST"
                subtitle="Tax settings for sales and reporting"
                badge={settings.gstApplicable ? <Pill tone="green">Active</Pill> : <Pill tone="slate">Off</Pill>}
              >
                <div className="flex items-center justify-between gap-4 bg-stone-50 rounded-xl p-4">
                  <div>
                    <p className="text-sm font-semibold text-ink">GST Applicable</p>
                    <p className="text-xs text-muted mt-0.5">Turn on to track GST collected on sales and GST paid on materials</p>
                  </div>
                  <Toggle
                    checked={!!settings.gstApplicable}
                    onChange={() => updateSettingsField('gstApplicable', !settings.gstApplicable)}
                    label="GST Applicable"
                  />
                </div>

                {settings.gstApplicable && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label htmlFor="gst-rate" className={LABEL}>GST Rate (%)</label>
                      <input
                        id="gst-rate"
                        type="number"
                        step="0.01"
                        min="0"
                        value={settings.gstRate ?? 0}
                        onChange={(e) => updateSettingsField('gstRate', parseFloat(e.target.value) || 0)}
                        className={`${FIELD} font-mono`}
                        placeholder="18"
                      />
                    </div>
                    <div>
                      <label htmlFor="gst-mode" className={LABEL}>Pricing Mode</label>
                      <select
                        id="gst-mode"
                        value={settings.gstPricingMode || 'exclusive'}
                        onChange={(e) => updateSettingsField('gstPricingMode', e.target.value)}
                        className={FIELD}
                      >
                        <option value="exclusive">Exclusive (GST added on top of menu prices)</option>
                        <option value="inclusive">Inclusive (menu prices already include GST)</option>
                      </select>
                    </div>
                  </div>
                )}
              </Section>
            </>
          )}

          {/* Integrations */}
          {activeSettingsTab === 'integrations' && (
            <Section
              icon={Puzzle}
              title="Integrations"
              subtitle="Connect your tools"
              badge={<Pill tone={connectedCount > 0 ? 'green' : 'slate'}>{connectedCount} connected</Pill>}
            >
              <div className="space-y-4">
                {/* Shopify */}
                <div className={`p-5 rounded-2xl ${shopifyStatus.connected ? 'bg-margin/5' : 'bg-stone-50'}`}>
                  <div className="flex items-start justify-between gap-3 mb-5">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${shopifyStatus.connected ? 'bg-margin text-white' : 'bg-white text-muted shadow-sm'}`}>
                        <Store size={24} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center flex-wrap gap-2">
                          <h4 className="text-base font-bold text-ink">Shopify Store</h4>
                          {shopifyStatus.connected ? (
                            <Pill tone="green"><Check size={10} /> Connected</Pill>
                          ) : !shopifyConfig.hasEnvCredentials ? (
                            <Pill tone="coral">Setup required</Pill>
                          ) : null}
                        </div>
                        <p className="text-sm text-muted mt-0.5 break-words">
                          {shopifyStatus.connected ? `Linked to ${shopifyStatus.shop}.myshopify.com` : 'Sync your online orders automatically'}
                        </p>
                      </div>
                    </div>
                    {shopifyStatus.connected && (
                      <button
                        onClick={disconnectShopify}
                        className="flex items-center gap-1.5 text-sm font-semibold text-coral hover:bg-coral/10 px-3 py-1.5 rounded-lg transition-colors shrink-0"
                      >
                        <LogOut size={14} />
                        Disconnect
                      </button>
                    )}
                  </div>

                  {!shopifyStatus.connected ? (
                    <div className="space-y-4">
                      {!shopifyConfig.hasEnvCredentials && (
                        <div className="flex items-start gap-2 p-4 bg-coral/5 rounded-xl">
                          <AlertCircle size={16} className="text-coral mt-0.5 shrink-0" />
                          <p className="text-sm text-ink">
                            Shopify integration isn't configured on this server yet. An administrator needs to
                            set <code className="font-mono text-xs bg-white px-1.5 py-0.5 rounded">SHOPIFY_CLIENT_ID</code> and{' '}
                            <code className="font-mono text-xs bg-white px-1.5 py-0.5 rounded">SHOPIFY_CLIENT_SECRET</code> in
                            the server environment before any store can connect.
                          </p>
                        </div>
                      )}
                      <div className="flex flex-col sm:flex-row gap-3 items-stretch">
                        <div className={`flex items-center gap-3 bg-white rounded-lg px-4 flex-1 focus-within:ring-2 focus-within:ring-primary/20 transition-shadow ${!shopifyConfig.hasEnvCredentials ? 'opacity-50' : ''}`}>
                          <Globe size={16} className="text-muted" />
                          <input
                            type="text"
                            aria-label="Shopify store name"
                            value={shopifyShopInput}
                            onChange={(e) => setShopifyShopInput(e.target.value)}
                            placeholder="your-store-name"
                            disabled={!shopifyConfig.hasEnvCredentials}
                            className="flex-1 min-w-0 bg-transparent border-none focus:ring-0 text-sm font-medium text-ink p-0 py-3 placeholder:text-muted/60 disabled:cursor-not-allowed"
                          />
                          <span className="font-mono text-[11px] text-muted whitespace-nowrap">.myshopify.com</span>
                        </div>
                        <button
                          onClick={connectShopify}
                          disabled={isConnectingShopify || !shopifyConfig.hasEnvCredentials}
                          className="h-12 flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white px-6 rounded-lg text-sm font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isConnectingShopify ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              <span>Connecting...</span>
                            </>
                          ) : (
                            <>
                              <Globe size={18} />
                              <span>Connect Store</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-4 bg-white rounded-xl">
                      <div className="w-10 h-10 rounded-lg bg-margin/10 flex items-center justify-center text-margin">
                        <CheckCircle2 size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-ink">Connection Active</p>
                        <p className="text-xs text-muted">Your orders are being synced automatically.</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Odoo */}
                <div className={`p-5 rounded-2xl ${odooStatus.connected ? 'bg-margin/5' : 'bg-stone-50'}`}>
                  <div className="flex items-start justify-between gap-3 mb-5">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${odooStatus.connected ? 'bg-margin text-white' : 'bg-white text-muted shadow-sm'}`}>
                        <Database size={24} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center flex-wrap gap-2">
                          <h4 className="text-base font-bold text-ink">Odoo eCommerce</h4>
                          {odooStatus.connected && <Pill tone="green"><Check size={10} /> Connected</Pill>}
                        </div>
                        <p className="text-sm text-muted mt-0.5 break-words">
                          {odooStatus.connected ? `Linked to ${odooStatus.url}` : 'Sync your Odoo website orders'}
                        </p>
                      </div>
                    </div>
                    {odooStatus.connected && (
                      <button
                        onClick={disconnectOdoo}
                        className="flex items-center gap-1.5 text-sm font-semibold text-coral hover:bg-coral/10 px-3 py-1.5 rounded-lg transition-colors shrink-0"
                      >
                        <LogOut size={14} />
                        Disconnect
                      </button>
                    )}
                  </div>

                  {!odooStatus.connected ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-white rounded-xl">
                        <div className="sm:col-span-2">
                          <p className="text-sm font-semibold text-ink">Odoo API Credentials</p>
                          <p className="text-xs text-muted">Enter your Odoo instance details to sync orders.</p>
                        </div>
                        <div className="sm:col-span-2">
                          <label htmlFor="odoo-url" className={LABEL}>Instance URL</label>
                          <input id="odoo-url" type="text" value={odooUrlInput} onChange={(e) => setOdooUrlInput(e.target.value)} placeholder="https://your-business.odoo.com" className={FIELD} />
                        </div>
                        <div>
                          <label htmlFor="odoo-db" className={LABEL}>Database Name</label>
                          <input id="odoo-db" type="text" value={odooDbInput} onChange={(e) => setOdooDbInput(e.target.value)} placeholder="e.g. my-business-db" className={FIELD} />
                        </div>
                        <div>
                          <label htmlFor="odoo-user" className={LABEL}>Username / Email</label>
                          <input id="odoo-user" type="text" value={odooUsernameInput} onChange={(e) => setOdooUsernameInput(e.target.value)} placeholder="admin@example.com" className={FIELD} />
                        </div>
                        <div className="sm:col-span-2">
                          <label htmlFor="odoo-pass" className={LABEL}>Password / API Key</label>
                          <input id="odoo-pass" type="password" value={odooPasswordInput} onChange={(e) => setOdooPasswordInput(e.target.value)} placeholder="••••••••••••" className={FIELD} />
                        </div>
                      </div>
                      <button
                        onClick={connectOdoo}
                        disabled={isConnectingOdoo}
                        className="w-full h-12 flex items-center justify-center gap-2 bg-ink hover:bg-ink/90 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isConnectingOdoo ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Connecting...</span>
                          </>
                        ) : (
                          <>
                            <Database size={18} />
                            <span>Connect Odoo</span>
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-4 bg-white rounded-xl">
                      <div className="w-10 h-10 rounded-lg bg-margin/10 flex items-center justify-center text-margin">
                        <CheckCircle2 size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-ink">Connection Active</p>
                        <p className="text-xs text-muted">Your Odoo orders are ready to be synced.</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Setup instructions */}
                <div className="p-5 bg-primary/5 rounded-2xl space-y-3">
                  <div className="flex items-center gap-2 text-primary">
                    <AlertCircle size={16} />
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-wider">Shopify setup instructions</span>
                  </div>
                  <p className="text-sm text-muted leading-relaxed">
                    1. Enter your shop subdomain (e.g. <b className="text-ink">my-shop</b>). <br />
                    2. In your Shopify Partner Dashboard, set the <b className="text-ink">Allowed redirection URL</b> to:
                  </p>
                  <div className="relative">
                    <code className="block p-3 pr-10 bg-white rounded-lg text-xs text-ink font-mono break-all select-all">
                      {callbackUrl}
                    </code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(callbackUrl); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted hover:text-primary transition-colors"
                      title="Copy to clipboard"
                      aria-label="Copy redirect URL"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </Section>
          )}

          {/* App customisation */}
          {activeSettingsTab === 'customisation' && (
            <Section icon={Palette} title="App Customisation" subtitle="Personalise your workspace">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div>
                  <span className={LABEL}>Brand Colour</span>
                  <p className="text-xs text-muted mb-3">Used on the nutrition cards you share.</p>
                  <div className="flex flex-wrap gap-3">
                    {BRAND_SWATCHES.map(color => (
                      <button
                        key={color}
                        onClick={() => updateSettingsField('primaryColor', color)}
                        aria-label={`Use ${color}`}
                        aria-pressed={settings.primaryColor?.toLowerCase() === color.toLowerCase()}
                        className={`w-10 h-10 rounded-full border-4 transition-transform hover:scale-110 shadow-sm ${
                          settings.primaryColor?.toLowerCase() === color.toLowerCase() ? 'border-white ring-2 ring-primary scale-110 shadow-md' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <div className="relative group">
                      <input
                        type="color"
                        aria-label="Custom colour"
                        value={settings.primaryColor}
                        onChange={(e) => updateSettingsField('primaryColor', e.target.value)}
                        className="w-10 h-10 rounded-full border-none p-0 overflow-hidden cursor-pointer shadow-sm hover:scale-110 transition-transform"
                      />
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-ink text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        Custom Colour
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <span className={LABEL}>Business Logo</span>
                  <div className="flex items-center gap-4">
                    <div className="w-24 h-24 rounded-xl bg-stone-50 flex items-center justify-center overflow-hidden shrink-0">
                      {settings.logo ? (
                        <img src={settings.logo} alt="Logo Preview" className="w-full h-full object-cover" />
                      ) : (
                        <Image size={32} className="text-stone-300" />
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <label className="cursor-pointer bg-stone-100 hover:bg-stone-200 text-ink px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors inline-block">
                          Upload Logo
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  updateSettingsField('logo', reader.result as string);
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                        </label>
                        {settings.logo && (
                          <button
                            onClick={() => updateSettingsField('logo', '')}
                            className="text-coral text-sm font-semibold hover:underline"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-muted">Recommended: square SVG or PNG</p>
                    </div>
                  </div>
                </div>
              </div>
            </Section>
          )}

          {/* User account */}
          {activeSettingsTab === 'account' && (
            <Section icon={UserCog} title="User Account" subtitle="Manage your profile and access">
              <div className="flex flex-col items-center text-center space-y-5 py-2">
                <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center text-primary border-4 border-white shadow-md">
                  <UserIcon size={48} />
                </div>
                <div>
                  <h4 className="font-bold text-ink text-2xl">{user?.name}</h4>
                  <p className="text-sm text-muted">{user?.email}</p>
                </div>
                <Pill tone="slate">Business Owner</Pill>

                <div className="w-full max-w-md pt-5 border-t border-stone-100 space-y-4">
                  <div className="flex items-center justify-between gap-3 bg-stone-50 rounded-xl px-4 py-3">
                    <div className="text-left">
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted">Subscription</p>
                      <p className={`text-sm font-semibold capitalize ${billingOk ? 'text-[#006143]' : 'text-coral'}`}>
                        {billing.status === 'none' ? 'No active plan' : billing.status.replace('_', ' ')}
                      </p>
                    </div>
                    <button
                      onClick={openBillingPortal}
                      disabled={isOpeningPortal}
                      className="text-sm font-semibold text-primary hover:text-primary-dark disabled:opacity-50"
                    >
                      {isOpeningPortal ? 'Opening…' : 'Manage Billing'}
                    </button>
                  </div>

                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 bg-coral/10 hover:bg-coral/15 text-coral h-12 rounded-lg text-sm font-semibold transition-colors"
                  >
                    <LogOut size={16} />
                    Sign Out of Stockpot
                  </button>
                </div>
              </div>
            </Section>
          )}

          {/* Inventory categories */}
          {activeSettingsTab === 'categories' && (
            <Section
              icon={Layers}
              title="Inventory Categories"
              subtitle="Organise your materials by category"
              badge={<Pill tone="slate">{categories.length} categories</Pill>}
            >
              <div className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <p className="text-sm text-muted">Add or remove categories to better organise your inventory.</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      aria-label="New category"
                      placeholder="New category..."
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') submitCategory(); }}
                      className={`${FIELD} flex-1 sm:w-52 !py-2.5`}
                    />
                    <button
                      onClick={submitCategory}
                      aria-label="Add category"
                      className="h-10 w-10 flex items-center justify-center bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors shadow-sm shrink-0"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {categories.map(cat => (
                    <div key={cat} className="flex items-center gap-2 bg-stone-50 pl-4 pr-2 py-2 rounded-full hover:bg-primary/5 transition-colors">
                      <span className="text-sm font-semibold text-ink">{cat}</span>
                      {cat !== 'Raw Materials' ? (
                        <button
                          onClick={() => deleteCategory(cat)}
                          className="p-1.5 text-muted hover:text-coral hover:bg-coral/10 rounded-full transition-colors"
                          title={`Delete ${cat}`}
                          aria-label={`Delete ${cat}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : (
                        <span className="w-2" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Section>
          )}
        </div>
      </div>
    </motion.div>
  );
};
