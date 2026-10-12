import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BrandColourPicker, normaliseHex } from '../BrandColourPicker';

describe('BrandColourPicker', () => {
  it('rings the chosen swatch', () => {
    render(<BrandColourPicker value="#2563EB" onChange={() => {}} />);
    expect(screen.getByLabelText('Use #2563EB').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByLabelText('Use #00797B').getAttribute('aria-checked')).toBe('false');
  });

  it('opens the device picker from the Custom circle and takes its colour', () => {
    const onChange = vi.fn();
    render(<BrandColourPicker value="#00797B" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Custom colour'), { target: { value: '#ff6600' } });
    expect(onChange).toHaveBeenCalledWith('#FF6600');
  });

  it('takes a typed colour code, short or long, with or without #, and ignores anything else', () => {
    const onChange = vi.fn();
    render(<BrandColourPicker value="#00797B" onChange={onChange} />);
    const box = screen.getByLabelText('Or type a colour code');
    fireEvent.change(box, { target: { value: 'c0392b' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('#C0392B');
    fireEvent.change(box, { target: { value: 'pink' } });
    expect(box.getAttribute('aria-invalid')).toBe('true');
    fireEvent.blur(box);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((box as HTMLInputElement).value).toBe('#00797B');
  });

  it('shows a custom colour as chosen, and says when the app shows it darker', () => {
    render(<BrandColourPicker value="#FF6600" onChange={() => {}} />);
    expect(screen.getAllByRole('radio').every(r => r.getAttribute('aria-checked') === 'false')).toBe(true);
    expect(screen.getByText(/#FF6600 is shown a little darker in the app/)).toBeTruthy();
    expect((screen.getByLabelText('Preview of a button') as HTMLElement).style.backgroundColor).not.toBe('');
  });

  it('puts a colour chosen another way into the code box', () => {
    const { rerender } = render(<BrandColourPicker value="#00797B" onChange={() => {}} />);
    rerender(<BrandColourPicker value="#2563eb" onChange={() => {}} />);
    expect((screen.getByLabelText('Or type a colour code') as HTMLInputElement).value).toBe('#2563EB');
  });

  it('treats the old default green as not chosen (Stockpot teal)', () => {
    render(<BrandColourPicker value="#10b981" onChange={() => {}} />);
    expect(screen.getByLabelText('Use #00797B').getAttribute('aria-checked')).toBe('true');
  });
});

describe('normaliseHex', () => {
  it.each([['#f60', '#FF6600'], ['f60', '#FF6600'], ['#ff6600', '#FF6600'], [' FF6600 ', '#FF6600']])('reads %s', (input, out) => {
    expect(normaliseHex(input)).toBe(out);
  });
  it.each(['', 'pink', '#12345', '#gggggg'])('refuses %s', input => {
    expect(normaliseHex(input)).toBeNull();
  });
});
