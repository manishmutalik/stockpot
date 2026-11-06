import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LandingPage from '../LandingPage';
import { TRIAL_DAYS } from '../utils/trial';

// jsdom has no IntersectionObserver, which the scroll-reveal animations use.
beforeAll(() => {
  globalThis.IntersectionObserver = class {
    observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
  } as unknown as typeof IntersectionObserver;
});

const renderPage = () => render(<MemoryRouter><LandingPage /></MemoryRouter>);

describe('LandingPage', () => {
  it('sends visitors only to the demo kitchen: no sign-in or log-in link before launch', () => {
    const { container } = renderPage();
    for (const name of [/try the demo/i, /explore the demo kitchen/i]) {
      const links = screen.getAllByRole('link', { name });
      expect(links.length).toBeGreaterThan(0);
      links.forEach(l => expect(l.getAttribute('href')).toBe('/app?demo'));
    }
    expect(screen.queryAllByRole('link', { name: /sign in|log in/i })).toHaveLength(0);
    // Every way into the app is the demo
    const appLinks = [...container.querySelectorAll('a[href^="/app"]')];
    expect(appLinks.length).toBeGreaterThan(0);
    appLinks.forEach(a => expect(a.getAttribute('href')).toBe('/app?demo'));
  });

  it('offers no trial before launch: every sign-up button leads to the waitlist instead', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    expect(screen.queryAllByRole('link', { name: /free trial|start free/i })).toHaveLength(0);
    expect(text).not.toMatch(/free trial|after the trial|card required/i);
    expect(text).not.toContain(`${TRIAL_DAYS}-day`);
    const join = screen.getAllByRole('link', { name: /join (the )?waitlist/i });
    expect(join.length).toBeGreaterThanOrEqual(3);
    join.forEach(a => expect(a.getAttribute('href')).toBe('#waitlist'));
    expect(container.querySelector('section#waitlist form')).not.toBeNull();
  });

  it('links the nav and footer to the sections of the page', () => {
    const { container } = renderPage();
    for (const id of ['how', 'features', 'pricing', 'faq']) {
      expect(container.querySelector(`section#${id}`)).not.toBeNull();
      expect(container.querySelector(`a[href="#${id}"]`)).not.toBeNull();
    }
  });

  it('links to the terms and privacy pages', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /terms of service/i }).getAttribute('href')).toBe('/terms');
    expect(screen.getByRole('link', { name: /privacy policy/i }).getAttribute('href')).toBe('/privacy');
  });

  it('offers the waitlist every few sections, so nobody has to scroll back to the top', () => {
    const { container } = renderPage();
    const sectionsWithJoin = [...container.querySelectorAll('main > section')]
      .map(sec => !!sec.querySelector('a[href="#waitlist"]'));
    // Hero, three answers, features, pricing and the closing section each carry one
    expect(sectionsWithJoin.filter(Boolean).length).toBeGreaterThanOrEqual(5);
    // and no two sections in a row go without one
    const gaps = sectionsWithJoin.join(',').split('true').map(run => run.split('false').length - 1);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(2);
  });

  it('hides the price before launch, and offers the first 25 customers a founding discount instead', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    expect(text).not.toContain('₹2,400');
    expect(text).not.toMatch(/\/\s?month/);
    const pricing = container.querySelector('#pricing')!.textContent ?? '';
    expect(pricing).toContain('Pricing at launch');
    expect(pricing).toContain('Founding offer: the first 25 customers get a special discount.');
    expect(pricing).toContain('Promote: photos made ready for Instagram');
    expect(text).toContain('Is there a launch offer?');
    expect(text).not.toMatch(/\$\d/);
    expect(text).not.toMatch(/₹499/);
    expect(text).not.toMatch(/\+\s*18%\s*GST|incl(uding|usive of)\s+GST/i);
  });

  it('makes no invented claims: no testimonials or made-up statistics', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/founder voices|case study|trusted by/i);
    expect(text).not.toMatch(/-22%|4\.2h|\b12% waste/i);
  });

  it('never says no credit card is needed', () => {
    const { container } = renderPage();
    expect(container.textContent ?? '').not.toMatch(/no credit card/i);
  });

  it('shows the real app, captured on the demo kitchen, every screenshot described', () => {
    const { container } = renderPage();
    const shots = [...container.querySelectorAll('img')].filter(img => img.getAttribute('src')?.startsWith('/landing/'));
    const srcs = shots.map(img => img.getAttribute('src'));
    for (const name of ['app-dashboard', 'app-orders', 'app-preorder-message', 'app-preorder-details', 'app-bill', 'logo-tagline']) {
      expect(srcs).toContain(`/landing/${name}.webp`);
    }
    shots.forEach(img => {
      expect(img.getAttribute('src')).toMatch(/^\/landing\/[a-z-]+\.webp$/);
      expect(img.getAttribute('alt')).toBeTruthy();
    });
    expect(screen.getByAltText(/dashboard on a laptop/i)).toBeTruthy();
    expect(screen.getByAltText(/orders on a tablet/i)).toBeTruthy();
    expect(screen.getByAltText(/anita's bill/i)).toBeTruthy();
  });

  it('does not reference screenshots and photos that were removed', () => {
    const { container } = renderPage();
    for (const old of ['hero-kitchen', 'laptop-pricing', 'pastries', 'sourdough', 'dashboard', 'orders', 'phone-bill']) {
      expect(container.querySelector(`img[src="/landing/${old}.webp"]`)).toBeNull();
    }
  });

  it('covers the features in words, one line each', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    for (const phrase of [
      'Take orders the way customers send them.',
      'Paste a WhatsApp message and Stockpot fills in the order, advance and all.',
      'Money made on every order',
      'Margin alerts, quarterly prices',
      'Know the day butter eats your margin. Every quarter, set new prices for all of it at once.',
      'A briefing every morning',
      'Stock that keeps up',
      'Photos into posts',
      'Built for India: rupees, GST, UPI, WhatsApp, and grams to litres.',
    ]) {
      expect(text).toContain(phrase);
    }
    expect(container.querySelectorAll('section#features h3')).toHaveLength(6);
    // No price is suggested for an item outside the quarterly review, so the page never says it is
    expect(text).not.toMatch(/suggests a price that wins|Use ₹/);
  });

  it('walks through an order from a WhatsApp message to a bill, in three steps', () => {
    const { container } = renderPage();
    const steps = [...container.querySelectorAll('section#how ol > li h3')].map(h => h.textContent);
    expect(steps).toEqual(['Paste the message', 'Check and book', 'Send the bill']);
  });

  it("answers the three morning questions with the demo kitchen's own figures, which add up", () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    for (const title of ['How much money you made', 'What needs restocking', 'Whose order is due']) expect(text).toContain(title);
    // ₹3,600 of sales, less ₹1,428 and ₹1,070, is the ₹1,102 the dashboard screenshot shows
    for (const figure of ['₹3,600', '−₹1,428', '−₹1,070', '₹1,102']) expect(text).toContain(figure);
    expect(3600 - 1428 - 1070).toBe(1102);
  });

  it('shows the hero promise and the founding offer', () => {
    const { container } = renderPage();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Stop guessing how much money you made.');
    const text = container.textContent ?? '';
    expect(text).toContain('For home bakers, home chefs, tiffin services and small cloud kitchens');
    expect(text).toContain('Stockpot tracks your ingredients, orders and costs, and shows what every order actually earns you');
    expect(text).toContain('Busy every day, still not sure how much money you made?');
    expect(text).toContain('The first 25 customers get a special founding discount.');
  });

  it('closes on the promise and signs off as the CFO of your food business, pointing to the demo while sign-ups are not open', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    expect(screen.getByRole('heading', { name: 'Stop guessing. Start knowing.' })).toBeTruthy();
    expect(container.querySelector('footer')!.textContent).toContain('The CFO of your food business.');
    expect(screen.getByAltText('Stockpot: inventory and margin tracking')).toBeTruthy();
    expect(text).toContain('Stockpot is launching soon. Explore the demo kitchen today');
    expect(text).toContain('Can I try it before I pay?Stockpot is launching soon.');
    if ((TRIAL_DAYS as number) !== 14) expect(text).not.toMatch(/\b14-day|\b14 days/);
  });

  it('does not repeat design claims the app does not back up', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/supplier invoice|Amul|Order #1042|Kitchen Margin OS|shrinkage/i);
  });

  it('opens and closes FAQ answers with the right aria state', () => {
    renderPage();
    const first = screen.getByRole('button', { name: /gst number/i });
    const second = screen.getByRole('button', { name: /accounting background/i });
    expect(first.getAttribute('aria-expanded')).toBe('true');
    expect(second.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(second);
    expect(second.getAttribute('aria-expanded')).toBe('true');
    expect(first.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('region', { name: /accounting background/i }).hasAttribute('hidden')).toBe(false);
    expect(screen.getByText(/if you know what you paid for your ingredients/i)).toBeTruthy();

    fireEvent.click(second);
    expect(second.getAttribute('aria-expanded')).toBe('false');
  });

  it('loads no extra web fonts and leaves page scrolling as it found it', () => {
    const before = document.documentElement.style.scrollBehavior;
    const { unmount } = renderPage();
    expect(document.head.querySelector('link[href*="Space+Grotesk"]')).toBeNull();
    expect(document.head.querySelector('link[href*="fonts.googleapis"]')).toBeNull();
    unmount();
    expect(document.documentElement.style.scrollBehavior).toBe(before);
  });

  it('lists every question in one column, in order', () => {
    const { container } = renderPage();
    const buttons = [...container.querySelectorAll('section#faq button[aria-expanded]')].map(b => b.textContent);
    expect(buttons).toHaveLength(11);
    expect(buttons[0]).toBe('Do I need a GST number?');
    expect(buttons[10]).toBe('Can I try it before I pay?');
  });

  it('puts every footer link in the footer nav, and keeps the copyright', () => {
    const { container } = renderPage();
    const nav = container.querySelector('footer nav[aria-label="Footer"]')!;
    expect([...nav.querySelectorAll('a')].map(a => a.textContent)).toEqual(['Features', 'Pricing', 'FAQ', 'Try the demo', 'Terms of Service', 'Privacy Policy']);
    expect(container.querySelector('footer')!.textContent).toContain(`© ${new Date().getFullYear()} Stockpot. All rights reserved.`);
  });
});

describe('LandingPage header', () => {
  afterEach(() => { Object.defineProperty(window, 'scrollY', { value: 0, configurable: true }); });
  const scrollTo = (y: number) => act(async () => {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    await new Promise(r => requestAnimationFrame(() => r(null)));
  });

  it('draws a line under the header once the page has scrolled, and takes it off at the top', async () => {
    const { container } = renderPage();
    const header = container.querySelector('header')!;
    expect(header.className).not.toContain('shadow-');
    await scrollTo(200);
    expect(header.className).toContain('shadow-');
    await scrollTo(0);
    expect(header.className).not.toContain('shadow-');
  });
});
