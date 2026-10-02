import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

/**
 * The small alert / confirm popup behind showAlert() and showConfirm().
 * `confirm` warns (coral) and offers Cancel + Delete; `alert` is a single OK.
 */
export function ConfirmDialog({
  type, title, message, onConfirm, onClose,
}: {
  type: 'alert' | 'confirm';
  title: string;
  message: string;
  onConfirm?: () => void;
  onClose: () => void;
}) {
  const isConfirm = type === 'confirm';
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div role="alertdialog" aria-modal="true" aria-label={title} className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="p-7 text-center">
          <div className={`w-14 h-14 rounded-2xl mx-auto mb-5 flex items-center justify-center ${isConfirm ? 'bg-coral/10 text-coral' : 'bg-primary/10 text-primary'}`}>
            {isConfirm ? <AlertCircle size={28} /> : <CheckCircle2 size={28} />}
          </div>
          <h3 className="text-lg font-bold tracking-tight text-ink mb-1.5">{title}</h3>
          <p className="text-sm text-muted leading-relaxed">{message}</p>
        </div>
        <div className="flex gap-3 px-5 pb-5">
          {isConfirm && (
            <button
              onClick={onClose}
              className="flex-1 h-11 rounded-xl bg-stone-100 text-ink text-sm font-semibold hover:bg-stone-200 transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={() => { onConfirm?.(); onClose(); }}
            className={`flex-1 h-11 rounded-xl text-white text-sm font-semibold transition-colors shadow-md ${
              isConfirm ? 'bg-coral hover:opacity-90 shadow-coral/20' : 'bg-primary hover:bg-primary-dark shadow-primary/20'
            }`}
          >
            {isConfirm ? 'Delete' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
