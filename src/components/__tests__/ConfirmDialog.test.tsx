import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from '../ConfirmDialog';

describe('ConfirmDialog', () => {
  it('confirm: offers Cancel and Delete, runs onConfirm then closes', () => {
    const onConfirm = vi.fn(); const onClose = vi.fn();
    render(<ConfirmDialog type="confirm" title="Delete Cake?" message="This cannot be undone." onConfirm={onConfirm} onClose={onClose} />);
    expect(screen.getByRole('alertdialog', { name: 'Delete Cake?' })).toBeTruthy();
    expect(screen.getByText('This cannot be undone.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('confirm: Cancel closes without confirming', () => {
    const onConfirm = vi.fn(); const onClose = vi.fn();
    render(<ConfirmDialog type="confirm" title="t" message="m" onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('alert: a single OK', () => {
    const onClose = vi.fn();
    render(<ConfirmDialog type="alert" title="Saved" message="All done." onClose={onClose} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the backdrop is clicked, but not the dialog itself', () => {
    const onClose = vi.fn();
    render(<ConfirmDialog type="alert" title="t" message="m" onClose={onClose} />);
    fireEvent.mouseDown(screen.getByRole('alertdialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole('alertdialog').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
