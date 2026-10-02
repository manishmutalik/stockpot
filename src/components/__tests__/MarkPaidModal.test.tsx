import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MarkPaidModal } from '../MarkPaidModal';

const money = (n: number) => `₹${n.toFixed(2)}`;
function renderModal(feeRates: any = { card: 2 }) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(<MarkPaidModal title="Mark as paid" summary="2 orders from Priya" amount={140} money={money} feeRates={feeRates} onConfirm={onConfirm} onClose={onClose} />);
  return { onConfirm, onClose };
}

describe('MarkPaidModal', () => {
  it('shows what is being paid and the amount', () => {
    renderModal();
    expect(screen.getByText('2 orders from Priya')).toBeTruthy();
    expect(screen.getByText('₹140.00')).toBeTruthy();
  });

  it('confirms with no method when none is picked', () => {
    const { onConfirm } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Mark as paid/ }));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it('confirms with the chosen method', () => {
    const { onConfirm } = renderModal();
    fireEvent.change(screen.getByLabelText(/Paid by/), { target: { value: 'upi' } });
    fireEvent.click(screen.getByRole('button', { name: /Mark as paid/ }));
    expect(onConfirm).toHaveBeenCalledWith('upi');
  });

  it('cancels without confirming', () => {
    const { onConfirm, onClose } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows the fee that will be counted for a method that has one', () => {
    renderModal({ card: 2 });
    fireEvent.change(screen.getByLabelText(/Paid by/), { target: { value: 'card' } });
    expect(screen.getByText(/2%/)).toBeTruthy();
  });
});
