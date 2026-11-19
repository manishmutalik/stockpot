import React from 'react';
import { ArrowRight, BookOpen, ClipboardList, Megaphone, MessageCircleQuestion, MessageSquareText, Sparkles, Sun } from 'lucide-react';
import type { DemoAiActions } from '../types';

export type { DemoAiActions };

/**
 * The demo kitchen's way into its AI features (utils/demoAi), on the Dashboard: each row opens one with its example
 * ready. Shown only in the demo.
 */
export const DemoAiCard: React.FC<{ actions: DemoAiActions }> = ({ actions }) => {
  const rows: { icon: React.ElementType; title: string; sub: string; go: () => void }[] = [
    { icon: MessageSquareText, title: 'Fill an order from a WhatsApp message', sub: 'A Hinglish birthday-cake order with an advance', go: actions.order },
    { icon: ClipboardList, title: 'Log a bake from a note', sub: '“24 croissants… 2 croissants burnt”', go: actions.bake },
    { icon: BookOpen, title: 'Read a handwritten recipe', sub: 'Choco chip cookies from a notebook', go: actions.recipe },
    { icon: Megaphone, title: 'Turn a photo into a post', sub: 'Caption and hashtags in English or Hinglish', go: actions.promote },
    { icon: MessageCircleQuestion, title: 'Ask about your business', sub: '“How much money did I make this month?”', go: actions.ask },
    { icon: Sun, title: 'Morning briefing', sub: 'Yesterday, summed up, on this Dashboard', go: actions.briefing },
  ];
  return (
    <section aria-label="Try the AI features" className="surface-card p-5 sm:p-6 border border-primary/20">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><Sparkles size={20} /></div>
        <div>
          <h2 className="text-lg font-bold text-ink">Try the AI features</h2>
          <p className="text-sm text-muted">Each one runs on a ready example in the demo. In your own account they read your own messages and photos.</p>
        </div>
      </div>
      <ul className="grid sm:grid-cols-2 gap-2.5">
        {rows.map(({ icon: Icon, title, sub, go }) => (
          <li key={title}>
            <button type="button" onClick={go} className="w-full text-left flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-3.5 py-3 hover:border-primary/40 hover:bg-primary/5 transition-colors">
              <Icon size={18} className="text-primary shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{title}</span>
                <span className="block text-xs text-muted truncate">{sub}</span>
              </span>
              <ArrowRight size={16} className="text-muted shrink-0" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
