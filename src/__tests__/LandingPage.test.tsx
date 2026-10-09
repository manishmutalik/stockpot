import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LandingPage from '../LandingPage';

// jsdom has no IntersectionObserver, which the scroll-reveal animations use.
beforeAll(() => {
  globalThis.IntersectionObserver = class {
    observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
  } as unknown as typeof IntersectionObserver;
});

const renderPage = () => render(<MemoryRouter><LandingPage /></MemoryRouter>);

describe('LandingPage', () => {
  it('sends every sign-up / log-in call to action to the app', () => {
    renderPage();
    for (const name of [/sign in \/ demo/i, /start free trial/i, /start your 45-day free trial/i, /start your free trial/i]) {
      const links = screen.getAllByRole('link', { name });
      expect(links.length).toBeGreaterThan(0);
      links.forEach(l => expect(l.getAttribute('href')).toBe('/app'));
    }
  });

  it('links the nav and footer to the sections of the page', () => {
    const { container } = renderPage();
    for (const id of ['features', 'how', 'pricing', 'faq']) {
      expect(container.querySelector(`section#${id}`)).not.toBeNull();
      expect(container.querySelector(`a[href="#${id}"]`)).not.toBeNull();
    }
  });

  it('links to the terms and privacy pages', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /terms of service/i }).getAttribute('href')).toBe('/terms');
    expect(screen.getByRole('link', { name: /privacy policy/i }).getAttribute('href')).toBe('/privacy');
  });

  it('shows the monthly price in rupees without claiming anything about GST on it', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    expect(text).toContain('₹1,200');
    expect(text).toContain('/ month');
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

  it('is honest that a card is required for the trial', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/no credit card/i);
    expect(text).toMatch(/card required/i);
  });

  it('only shows screenshots and photos that ship with the app, each described', () => {
    const { container } = renderPage();
    const shots = [...container.querySelectorAll('img')].filter(img => img.getAttribute('src')?.startsWith('/landing/'));
    const srcs = shots.map(img => img.getAttribute('src'));
    for (const name of ['hero-kitchen', 'phone-order', 'phone-bill', 'laptop-pricing', 'pastries', 'sourdough']) {
      expect(srcs).toContain(`/landing/${name}.webp`);
    }
    shots.forEach(img => {
      expect(img.getAttribute('src')).toMatch(/^\/landing\/[a-z-]+\.webp$/);
      // product screenshots carry real alt text; purely decorative photos are hidden from readers
      const decorative = img.getAttribute('aria-hidden') === 'true';
      expect(decorative ? img.getAttribute('alt') === '' : !!img.getAttribute('alt')).toBe(true);
    });
    expect(screen.getByAltText(/dashboard open on a tablet/i)).toBeTruthy();
    expect(screen.getByAltText(/add order form on a phone/i)).toBeTruthy();
    expect(screen.getByAltText(/bill for that order on a phone/i)).toBeTruthy();
    expect(screen.getByAltText(/menu on a laptop/i)).toBeTruthy();
  });

  it('does not reference the old screenshots that were removed', () => {
    const { container } = renderPage();
    for (const old of ['dashboard', 'dashboard-capture', 'device-laptop', 'device-phone', 'add-item', 'add-order', 'gst', 'inventory', 'orders', 'production', 'recipes', 'rnd', 'wastage', 'banner-wide', 'banner-tablet']) {
      expect(container.querySelector(`img[src="/landing/${old}.webp"]`)).toBeNull();
    }
  });

  it('covers the features in words', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    for (const phrase of [
      'Take orders the way customers send them',
      'Get paid without chasing',
      'Know how much money every order made',
      'Know when a price needs to go up',
      'A business briefing every morning',
      'Stock that keeps itself up to date',
      'Built for India',
    ]) {
      expect(text).toContain(phrase);
    }
  });

  it('shows the hero promise, the trial terms and four quick facts', () => {
    const { container } = renderPage();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('The CFO of your food business');
    const text = container.textContent ?? '';
    expect(text).toContain('Know exactly how much money your food business makes.');
    expect(text).not.toContain('Know exactly what your food business makes');
    expect(text).toContain('Busy every day. Still not sure how much money you made?');
    expect(text).toContain('Know exactly how much money you made this week.');
    expect(text).not.toMatch(/Still not sure what you made|Know exactly what you made/);
    expect(text).toMatch(/after trial/);
    for (const fact of ['Per-dish', 'UPI + QR', 'Auto-fill', 'Live Alerts']) expect(text).toContain(fact);
    expect(text).toContain('₹743.04');
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

  it('lays the FAQ out in two columns, in order, with every question present', () => {
    const { container } = renderPage();
    const buttons = [...container.querySelectorAll('section#faq button[aria-expanded]')].map(b => b.textContent);
    expect(buttons).toHaveLength(10);
    const columns = [...container.querySelectorAll('section#faq .md\\:grid-cols-2 > div')];
    expect(columns).toHaveLength(2);
    const names = columns.map(col => [...col.querySelectorAll('button[aria-expanded]')].map(b => b.textContent));
    expect(names[0]).toHaveLength(5);
    expect(names[1]).toHaveLength(5);
    expect(names[0][0]).toBe('Do I need a GST number?');
    expect(names[1][4]).toBe('Can I try it before I pay?');
    expect([...names[0], ...names[1]]).toEqual(buttons);
  });

  it('puts every footer link in the footer nav, and keeps the copyright', () => {
    const { container } = renderPage();
    const nav = container.querySelector('footer nav[aria-label="Footer"]')!;
    expect([...nav.querySelectorAll('a')].map(a => a.textContent)).toEqual(['Features', 'Pricing', 'FAQ', 'Log in', 'Terms of Service', 'Privacy Policy']);
    expect(container.querySelector('footer')!.textContent).toContain(`© ${new Date().getFullYear()} Stockpot. All rights reserved.`);
  });
});

describe('LandingPage motion', () => {
  const realMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });
  const scrollTo = (y: number) => act(async () => {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    await new Promise(r => requestAnimationFrame(() => r(null)));
  });
  const mockMotion = (reduced: boolean) => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? reduced : true,
      media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  };

  it('puts a shadow on the header once the page has scrolled, and takes it off at the top', async () => {
    const { container } = renderPage();
    const header = container.querySelector('header')!;
    expect(header.className).not.toContain('shadow-md');
    await scrollTo(200);
    expect(header.className).toContain('shadow-md');
    await scrollTo(0);
    expect(header.className).not.toContain('shadow-md');
  });

  it('drifts the hero glow with the scroll', async () => {
    mockMotion(false);
    const { container } = renderPage();
    const glow = container.querySelector('section div[aria-hidden="true"]') as HTMLElement;
    await scrollTo(500);
    expect(glow.style.transform).toBe('translate3d(0, 90.0px, 0)');
  });

  it('keeps everything still for a visitor who asked for reduced motion', async () => {
    mockMotion(true);
    const { container } = renderPage();
    const glow = container.querySelector('section div[aria-hidden="true"]') as HTMLElement;
    await scrollTo(500);
    expect(glow.style.transform).toBe('');
    for (const img of container.querySelectorAll('img[src="/landing/pastries.webp"], img[src="/landing/sourdough.webp"]')) {
      expect((img as HTMLElement).style.transform).toBe('');
    }
    // the tilt does nothing either
    const tilt = container.querySelector('.landing-tilt') as HTMLElement;
    fireEvent.mouseMove(tilt, { clientX: 10, clientY: 10 });
    await act(async () => { await new Promise(r => requestAnimationFrame(() => r(null))); });
    expect(tilt.style.transform).toBe('');
  });

  it('tilts toward the mouse and settles back when it leaves', async () => {
    mockMotion(false);
    const { container } = renderPage();
    const tilt = container.querySelector('.landing-tilt') as HTMLElement;
    tilt.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON() {} }) as DOMRect;
    fireEvent.mouseMove(tilt, { clientX: 200, clientY: 0 });
    await act(async () => { await new Promise(r => requestAnimationFrame(() => r(null))); });
    expect(tilt.style.transform).toContain('rotateX(5.00deg) rotateY(5.00deg)');
    fireEvent.mouseLeave(tilt);
    expect(tilt.style.transform).toBe('');
  });
});
