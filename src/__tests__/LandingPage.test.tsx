import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    for (const name of [/sign in \/ demo/i, /start free trial/i, /start your 14-day free trial/i, /start your free trial/i]) {
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
      'Know what every order made',
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
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Know exactly what your food business makes.');
    const text = container.textContent ?? '';
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
});
