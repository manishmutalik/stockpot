import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HelpView } from '../HelpView';

describe('HelpView', () => {
  it('lists the web topics by section, and the phone app topics after them', () => {
    render(<HelpView businessName="Anita's Bakes" />);
    expect(screen.getByRole('heading', { name: 'Getting started' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Setting up Stockpot/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Saying or typing an order/ })).toBeTruthy();
  });

  it('opens a topic with its steps, button names in bold', () => {
    render(<HelpView />);
    fireEvent.click(screen.getByRole('button', { name: /^GST/ }));
    const article = screen.getByRole('article');
    expect(article.textContent).toMatch(/Turn on GST Applicable/);
    expect(article.querySelector('strong')?.textContent).toBe('GST Applicable');
    fireEvent.click(screen.getByRole('button', { name: /All help/ }));
    expect(screen.queryByRole('article')).toBeNull();
  });

  it('searches, says when nothing matches, and marks phone topics', () => {
    render(<HelpView />);
    const box = screen.getByLabelText('Search help');
    fireEvent.change(box, { target: { value: 'rent' } });
    expect(screen.getByRole('button', { name: /Fixed costs and payment fees/ })).toBeTruthy();
    fireEvent.change(box, { target: { value: 'notifications' } });
    expect(screen.getAllByText('Phone').length).toBeGreaterThan(0);
    fireEvent.change(box, { target: { value: 'zebra' } });
    expect(screen.getByText(/Nothing matches/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Clear search'));
    expect(screen.getByRole('heading', { name: 'Getting started' })).toBeTruthy();
  });
});
