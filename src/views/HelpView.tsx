import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, ChevronRight, LifeBuoy, Search, Smartphone, X } from 'lucide-react';
import { helpSectionsFor, helpSpans, HELP_TOPICS, searchAllHelp, type HelpBlock, type HelpTopic } from '../utils/helpTopics';

/**
 * Help: how to use Stockpot, from utils/helpTopics (the same topics the phone app shows, each marked for the app it is
 * about). A search box, the topics by section, and one topic at a time. On a wide screen the list stays beside the topic;
 * on a narrow one the topic replaces the list, with a back button. Phone-app topics are listed too, so an owner can read
 * what Stockpot Quick does before installing it.
 */
const WEB_SECTIONS = helpSectionsFor('web');
const PHONE_TOPICS = HELP_TOPICS.filter(t => t.apps.includes('phone') && !t.apps.includes('web'));

export const Rich: React.FC<{ text: string }> = ({ text }) => (
  <>{helpSpans(text).map((s, i) => (s.bold ? <strong key={i} className="font-semibold text-ink">{s.text}</strong> : <React.Fragment key={i}>{s.text}</React.Fragment>))}</>
);

const Block: React.FC<{ block: HelpBlock }> = ({ block }) => {
  if (block.kind === 'text') return <p className="text-[15px] leading-relaxed text-ink/90"><Rich text={block.text} /></p>;
  if (block.kind === 'steps') {
    return (
      <ol className="space-y-3">
        {block.items.map((item, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-ink/90">
            <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
            <span><Rich text={item} /></span>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ul className="space-y-2">
      {block.items.map((item, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-ink/90">
          <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-2.5" />
          <span><Rich text={item} /></span>
        </li>
      ))}
    </ul>
  );
};

const TopicButton: React.FC<{ topic: HelpTopic; active: boolean; onOpen: (id: string) => void }> = ({ topic, active, onOpen }) => (
  <button
    type="button" onClick={() => onOpen(topic.id)} aria-current={active ? 'true' : undefined}
    className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${active ? 'bg-primary/10' : 'hover:bg-stone-50'}`}
  >
    <span className="flex-1 min-w-0">
      <span className={`block text-sm font-semibold ${active ? 'text-primary' : 'text-ink'}`}>{topic.title}</span>
      <span className="block text-xs text-muted mt-0.5">{topic.summary}</span>
    </span>
    <ChevronRight size={16} className="text-muted shrink-0" />
  </button>
);

export const HelpView: React.FC<{ businessName?: string }> = ({ businessName }) => {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  // Phone topics are found too, marked as such.
  const results = useMemo(() => (query.trim() ? searchAllHelp(query, 'web') : null), [query]);
  const open = openId ? HELP_TOPICS.find(t => t.id === openId) ?? null : null;
  const openTopic = (id: string) => { setOpenId(id); window.scrollTo?.({ top: 0 }); };

  const list = (
    <div className="space-y-6">
      {results ? (
        <section aria-label="Search results" className="surface-card p-2">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">Nothing matches “{query.trim()}”. Try a shorter word, such as “bill” or “stock”.</p>
          ) : results.map(t => (
            <div key={t.id} className="relative">
              <TopicButton topic={t} active={t.id === openId} onOpen={openTopic} />
              {!t.apps.includes('web') && <span className="absolute right-10 top-3 text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/10 rounded px-1.5 py-0.5">Phone</span>}
            </div>
          ))}
        </section>
      ) : (
        <>
          {WEB_SECTIONS.map(s => (
            <section key={s.id} aria-labelledby={`help-${s.id}`}>
              <h3 id={`help-${s.id}`} className="px-1 mb-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">{s.title}</h3>
              <div className="surface-card p-2">
                {s.topics.map(t => <TopicButton key={t.id} topic={t} active={t.id === openId} onOpen={openTopic} />)}
              </div>
            </section>
          ))}
          <section aria-labelledby="help-phone">
            <h3 id="help-phone" className="px-1 mb-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5"><Smartphone size={12} /> Stockpot Quick, the phone app</h3>
            <div className="surface-card p-2">
              {PHONE_TOPICS.map(t => <TopicButton key={t.id} topic={t} active={t.id === openId} onOpen={openTopic} />)}
            </div>
          </section>
        </>
      )}
    </div>
  );

  return (
    <motion.div key="help" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6 pb-20">
      <div>
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted mb-1">
          <span className="truncate">{businessName || 'My Bakery'}</span>
          <span className="text-stone-300">/</span>
          <span className="text-primary font-semibold whitespace-nowrap">Help</span>
        </div>
        <h2 className="text-2xl md:text-[32px] md:leading-tight font-bold tracking-tight text-ink">How to use Stockpot</h2>
        <p className="text-sm text-muted mt-1 max-w-2xl">Short answers for each part of the app, on the web and on your phone.</p>
      </div>

      <div className="relative max-w-xl">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search help, e.g. “pre-order” or “GST”" aria-label="Search help"
          className="w-full h-12 rounded-xl border border-stone-200 bg-white pl-11 pr-10 text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-ink">
            <X size={16} />
          </button>
        )}
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-8 lg:items-start">
        <div className={open ? 'hidden lg:block' : ''}>{list}</div>

        {open ? (
          <article aria-labelledby="help-topic-title" className="surface-card p-5 sm:p-8 space-y-5 lg:sticky lg:top-24">
            <button type="button" onClick={() => setOpenId(null)} className="lg:hidden inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
              <ArrowLeft size={16} /> All help
            </button>
            <div>
              {!open.apps.includes('web') && (
                <span className="inline-flex items-center gap-1 mb-2 text-[11px] font-semibold uppercase tracking-wide text-primary bg-primary/10 rounded px-2 py-0.5"><Smartphone size={12} /> Phone app</span>
              )}
              <h3 id="help-topic-title" className="text-xl sm:text-2xl font-bold tracking-tight text-ink">{open.title}</h3>
              <p className="text-sm text-muted mt-1">{open.summary}</p>
            </div>
            {open.body.map((b, i) => <Block key={i} block={b} />)}
          </article>
        ) : (
          <div className="hidden lg:flex surface-card p-8 flex-col items-center justify-center text-center gap-3 min-h-[16rem]">
            <LifeBuoy size={32} className="text-primary" />
            <p className="text-base font-semibold text-ink">Choose a topic</p>
            <p className="text-sm text-muted max-w-sm">New to Stockpot? Start with <button type="button" onClick={() => openTopic('first-steps')} className="font-semibold text-primary hover:underline">Setting up Stockpot</button>.</p>
          </div>
        )}
      </div>
    </motion.div>
  );
};
