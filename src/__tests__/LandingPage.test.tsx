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
    for (const name of [/log in/i, /start free trial/i, /start your 14-day free trial/i, /get started free/i]) {
      const links = screen.getAllByRole('link', { name });
      expect(links.length).toBeGreaterThan(0);
      links.forEach(l => expect(l.getAttribute('href')).toBe('/app'));
    }
  });

  it('links to the terms and privacy pages', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /terms of service/i }).getAttribute('href')).toBe('/terms');
    expect(screen.getByRole('link', { name: /privacy policy/i }).getAttribute('href')).toBe('/privacy');
  });

  it('shows the monthly price in rupees', () => {
    const { container } = renderPage();
    expect(container.textContent).toContain('₹1,200');
    expect(container.textContent).toContain('/ month');
    expect(container.textContent).not.toMatch(/\$\d/);
    expect(container.textContent).not.toMatch(/₹499/);
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

  it('only shows screenshots that ship with the app, each with alt text', () => {
    renderPage();
    const shots = screen.getAllByRole('img').filter(img => img.getAttribute('src')?.startsWith('/landing/'));
    expect(shots.length).toBeGreaterThanOrEqual(8);
    shots.forEach(img => {
      expect(img.getAttribute('alt')).toBeTruthy();
      expect(img.getAttribute('src')).toMatch(/^\/landing\/[a-z-]+\.webp$/);
    });
  });

  it('shows the banner and food photos with alt text', () => {
    const { container } = renderPage();
    const srcs = [...container.querySelectorAll('img, source')].map(el => el.getAttribute('src') ?? el.getAttribute('srcset'));
    for (const name of ['banner-wide', 'banner-tablet', 'pastries', 'sourdough']) {
      expect(srcs).toContain(`/landing/${name}.webp`);
    }
    expect(screen.getByAltText(/inventory and margin tracking on a tablet/i)).toBeTruthy();
    expect(screen.getByAltText(/croissants, pain au chocolat/i)).toBeTruthy();
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
    expect(screen.getByText(/know your ingredient costs/i)).toBeTruthy();

    fireEvent.click(second);
    expect(second.getAttribute('aria-expanded')).toBe('false');
  });

  it('loads its fonts for the page only and removes them on leave', () => {
    const { unmount } = renderPage();
    expect(document.head.querySelector('link[href*="Space+Grotesk"]')).not.toBeNull();
    unmount();
    expect(document.head.querySelector('link[href*="Space+Grotesk"]')).toBeNull();
  });
});
