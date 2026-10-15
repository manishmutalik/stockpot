import React from 'react';
import { Sparkles } from 'lucide-react';
import { MODAL_LABEL } from './ModalShell';

/** In place of an AI box in a form, when AI is not available but the owner can do something about it: says why. */
export const AiBlockedNote: React.FC<{ title: string; message: string }> = ({ title, message }) => (
  <div role="note" className="rounded-2xl border border-stone-200 bg-stone-50 p-4 space-y-1.5">
    <p className={`${MODAL_LABEL} flex items-center gap-1.5 !mb-0 text-muted`}>
      <Sparkles size={12} /> {title}
    </p>
    <p className="text-sm text-muted">{message}</p>
  </div>
);
