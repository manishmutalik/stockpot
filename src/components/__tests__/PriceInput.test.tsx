import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PriceInput } from '../PriceInput';

const setup = (value = 10) => {
  const onCommit = vi.fn();
  render(<PriceInput ariaLabel="Price" value={value} onCommit={onCommit} />);
  return { onCommit, input: screen.getByLabelText('Price') as HTMLInputElement };
};

describe('PriceInput', () => {
  it('saves once with the final number, not on every keystroke', () => {
    const { onCommit, input } = setup();
    fireEvent.change(input, { target: { value: '6' } });
    fireEvent.change(input, { target: { value: '65' } });
    fireEvent.change(input, { target: { value: '650' } });
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('650');
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(650);
  });
  it('saves on Enter', () => {
    const { onCommit, input } = setup();
    input.focus();
    fireEvent.change(input, { target: { value: '12.5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(12.5);
  });
  it('does not save when nothing changed', () => {
    const { onCommit, input } = setup(10);
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.blur(input);
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
  });
  it('reads an emptied field as 0', () => {
    const { onCommit, input } = setup(10);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(0);
  });
  it('can show an empty field for 0 so a placeholder shows', () => {
    render(<PriceInput ariaLabel="Target" value={0} onCommit={vi.fn()} blankWhenZero placeholder="71.4" />);
    expect((screen.getByLabelText('Target') as HTMLInputElement).value).toBe('');
  });
});
