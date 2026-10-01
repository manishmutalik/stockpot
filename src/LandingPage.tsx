import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowRight, BookOpen, Boxes, ChevronDown, CircleCheck, Factory, FlaskConical, Landmark,
  PiggyBank, Table2, Trash2, TrendingDown, Truck
} from 'lucide-react';

/**
 * The public landing page. Every screenshot below is a real capture of the
 * app running on the demo sandbox's data (see public/landing/), so the page
 * never promises a screen the product doesn't have, and nothing on it is an
 * invented statistic or testimonial.
 *
 * What the page says about billing has to match server.ts: the free trial is
 * 14 days and Stripe Checkout collects a card to start it, so the copy says a
 * card is required and never "no credit card". The monthly price is defined
 * once here; it must equal the Stripe price in STRIPE_PRICE_ID (in INR).
 */
const PRICE = { symbol: '₹', amount: '1,200', period: 'month' };
const TRIAL_DAYS = 14;

const DISPLAY = "font-['Space_Grotesk',ui-sans-serif,system-ui,sans-serif]";
const BODY = "font-['Inter',ui-sans-serif,system-ui,sans-serif]";

/** Page gutter and max width: wide enough that desktop isn't a narrow column. */
const WRAP = 'w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-12';
const SECTION = 'py-14 sm:py-20';
const BAND = 'bg-surface border-y border-[#D0E4E2]';

const CARD = 'bg-white rounded-[20px] border border-slate-200 shadow-[0_1px_2px_0_rgba(43,49,61,0.04)]';
const CARD_HOVER = 'transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_12px_24px_-4px_rgba(43,49,61,0.08),0_4px_8px_-2px_rgba(43,49,61,0.04)]';
const BTN_PRIMARY = 'whitespace-nowrap inline-flex items-center justify-center gap-2 h-12 px-7 rounded-xl bg-primary hover:bg-primary-dark text-white font-semibold shadow-md shadow-primary/20 transition-all active:scale-[0.98]';
const BTN_SECONDARY = 'whitespace-nowrap inline-flex items-center justify-center gap-2 h-12 px-7 rounded-xl bg-white hover:bg-slate-50 text-ink font-semibold border border-slate-200 hover:border-slate-300 transition-colors';

const FAQS: { q: string; a: string }[] = [
  { q: 'Do I need a GST number to use Stockpot?', a: 'No — GST tracking is optional and only turns on if you enable it in Settings.' },
  { q: 'Do I need an accounting background?', a: 'Not at all. If you know your ingredient costs and units, Stockpot handles the math and the margin calculations.' },
  { q: 'What currency does it support?', a: 'Stockpot starts in Indian rupees (₹). You can pick another currency from the selector in the app; it applies everywhere.' },
  { q: 'Is my recipe and supplier data safe?', a: "Your data is stored in Google's Firebase cloud, which encrypts data in transit and at rest, and each account can only read and write its own data." },
  { q: 'Can I cancel anytime?', a: 'Yes — from Settings → User Account → Manage Billing. No lock-in.' },
  {
    q: 'Can I try it before I pay?',
    a: `Yes. The ${TRIAL_DAYS}-day trial is free — a card is required to start it, and you won't be charged if you cancel before it ends. You can also explore the demo sandbox from the sign-in screen without signing up.`,
  },
];

const PROBLEMS = [
  { icon: TrendingDown, tone: 'bg-red-50 text-red-600', title: 'Silent ingredient inflation', body: "When butter goes up, a manual recipe spreadsheet doesn't warn you that your signature pastry is now barely breaking even." },
  { icon: Table2, tone: 'bg-amber-50 text-amber-600', title: 'Spreadsheet formula fragility', body: 'Broken #REF! errors, manual unit conversions (grams to kilos to litres) and duplicate entries steal your cooking time.' },
  { icon: Trash2, tone: 'bg-teal-50 text-primary', title: 'Unaccounted batch & prep loss', body: 'Trimmings, proofing rejects and expired cream disappear into the bin without ever being counted against production cost.' },
];

interface Tile {
  icon: React.ElementType;
  tag: string;
  title: string;
  body: string;
  images: { src: string; alt: string }[];
  span: string;
}

const TILES: Tile[] = [
  {
    icon: BookOpen, tag: 'Recipe engine', span: 'lg:col-span-4',
    title: 'Real-time recipe costing, to the gram',
    body: 'Change the cost of an ingredient once, and every menu item recalculates its cost, margin and suggested price automatically.',
    images: [{ src: '/landing/recipes.webp', alt: 'Menu & Master Recipes in Stockpot' }],
  },
  {
    icon: Boxes, tag: 'Smart inventory', span: 'lg:col-span-2',
    title: 'Never run out mid-bake',
    body: 'Live stock for raw materials and packaging, with low-stock alerts before you are caught short.',
    images: [{ src: '/landing/inventory.webp', alt: 'Raw materials and stock alerts' }],
  },
  {
    icon: Factory, tag: 'Batch yields', span: 'lg:col-span-3',
    title: 'Automated stock logs',
    body: 'Logging a production run deducts the ingredients, adds finished stock and records the batch cost. No manual math, no double entry.',
    images: [{ src: '/landing/production.webp', alt: 'Production runs and finished goods' }],
  },
  {
    icon: Truck, tag: 'Courier delivery', span: 'lg:col-span-3',
    title: 'True fulfilment profitability',
    body: 'Capture what couriers charge you against what you charge the customer for delivery, on every order.',
    images: [{ src: '/landing/orders.webp', alt: 'Customer & courier orders' }],
  },
  {
    icon: Landmark, tag: 'GST & compliance', span: 'lg:col-span-2',
    title: 'Built for India',
    body: 'Switch GST on when you register. Choose inclusive or exclusive pricing; GST is tracked separately from your food margins.',
    images: [{ src: '/landing/gst.webp', alt: 'Business profile and GST settings' }],
  },
  {
    icon: FlaskConical, tag: 'Audit & testing', span: 'lg:col-span-4',
    title: 'See what spoilage really costs',
    body: 'Log wastage and recipe experiments separately from your real numbers, so testing a new item never messes with your books.',
    images: [
      { src: '/landing/wastage.webp', alt: 'Wastage & loss ledger' },
      { src: '/landing/rnd.webp', alt: 'R&D test kitchen' },
    ],
  },
];

const STEPS = [
  { title: 'Add ingredients & unit costs', body: 'Enter stock quantities, units and your supplier prices once.', chip: 'g · kg · ml · l · pcs' },
  { title: 'Build master recipes', body: 'Stockpot costs each recipe automatically and suggests a price.', chip: 'Suggested price' },
  { title: 'Log orders & batches on the fly', body: 'Ingredients deduct from stock without manual spreadsheets.', chip: 'Auto-deduct stock' },
  { title: 'Monitor your net profit daily', body: 'See revenue, ingredient usage and margin health in one place.', chip: 'Live net profit' },
];

const PLAN_FEATURES = [
  `${TRIAL_DAYS}-day free trial (card required to start)`,
  'Unlimited recipes, orders and batch production runs',
  'GST compliance module (India) & multi-currency',
  'Low-stock alerts & wastage ledger',
];

const Reveal: React.FC<{ children: React.ReactNode; className?: string; delay?: number }> = ({ children, className, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-40px' }}
    transition={{ duration: 0.45, delay }}
    className={className}
  >
    {children}
  </motion.div>
);

const Shot: React.FC<{ src: string; alt: string; className?: string }> = ({ src, alt, className = '' }) => (
  <img src={src} alt={alt} loading="lazy" decoding="async" className={`w-full h-full object-cover object-top ${className}`} />
);

const Eyebrow: React.FC<{ children: React.ReactNode; tone?: 'teal' | 'white' }> = ({ children, tone = 'teal' }) => (
  <span className={`inline-block px-3 py-1 rounded-full border border-[#D0E4E2] text-primary text-xs font-semibold uppercase tracking-wider mb-4 ${tone === 'white' ? 'bg-white' : 'bg-surface'}`}>
    {children}
  </span>
);

const LandingPage: React.FC = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Space Grotesk + Inter are only used on this page, so load them here rather
  // than for the whole app; smooth-scroll the in-page anchors while it's open.
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap';
    document.head.appendChild(link);
    const previous = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => {
      link.remove();
      document.documentElement.style.scrollBehavior = previous;
    };
  }, []);

  return (
    <div className={`min-h-screen bg-[#F8FAFB] text-ink ${BODY} selection:bg-primary/20 overflow-x-hidden`}>
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#F8FAFB]/90 backdrop-blur-md border-b border-slate-200">
        <div className={`${WRAP} h-16 flex items-center justify-between gap-4`}>
          <a href="#top" className="flex items-center gap-2.5" aria-label="Stockpot home">
            <img src="/logo-icon.png" alt="" className="w-8 h-8" />
            <span className={`${DISPLAY} text-xl font-bold tracking-tight`}>Stockpot</span>
          </a>
          <nav aria-label="Sections" className="hidden md:flex items-center gap-8 text-sm font-medium text-muted">
            <a href="#features" className="hover:text-primary transition-colors">Features</a>
            <a href="#how" className="hover:text-primary transition-colors">How it works</a>
            <a href="#pricing" className="hover:text-primary transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-primary transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link to="/app" className="whitespace-nowrap text-sm font-semibold text-ink hover:text-primary transition-colors px-2">Log In</Link>
            <Link to="/app" className="whitespace-nowrap inline-flex items-center gap-1.5 h-10 px-4 sm:px-5 rounded-lg bg-primary hover:bg-primary-dark text-white text-sm font-semibold transition-colors">
              <span className="hidden sm:inline">Start Free Trial</span>
              <span className="sm:hidden">Start Free</span>
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero */}
        <section className="relative pt-12 sm:pt-16 lg:pt-20 pb-14 sm:pb-20">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-gradient-to-b from-primary/10 to-transparent" />
          <div className={`${WRAP} relative grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-12 lg:gap-14 items-center`}>
            <div className="text-center lg:text-left">
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface border border-[#D0E4E2] text-xs font-semibold text-primary mb-6"
              >
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Built for home bakers, chefs &amp; small food businesses
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.08 }}
                className={`${DISPLAY} text-4xl sm:text-5xl lg:text-[3.25rem] 2xl:text-6xl font-bold tracking-[-0.03em] leading-[1.1] mb-5`}
              >
                Know your real margins.{' '}
                <span className="text-primary">Down to the last gram.</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.16 }}
                className="text-lg sm:text-xl text-muted max-w-xl mx-auto lg:mx-0 leading-relaxed mb-8"
              >
                Stockpot tracks your ingredients in real time, costs every recipe automatically, and shows which items are priced too low, so you never sell at a loss by accident.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.24 }}
                className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3"
              >
                <Link to="/app" className={`${BTN_PRIMARY} w-full sm:w-auto`}>
                  Start your {TRIAL_DAYS}-day free trial
                </Link>
                <a href="#features" className={`${BTN_SECONDARY} w-full sm:w-auto`}>
                  See what&apos;s inside <ArrowRight size={16} />
                </a>
              </motion.div>
              <p className="mt-5 text-sm text-muted">
                Card required to start · Free for {TRIAL_DAYS} days · Cancel anytime
              </p>
            </div>

            {/* Product frame */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3 }}
              className="rounded-[20px] bg-white border border-slate-200 overflow-hidden shadow-[0_24px_48px_-12px_rgba(0,121,123,0.18)] text-left"
            >
              <div className="flex items-center gap-3 px-4 py-3 bg-slate-100 border-b border-slate-200">
                <div className="flex gap-1.5" aria-hidden="true">
                  <span className="w-3 h-3 rounded-full bg-[#FF5F56]" />
                  <span className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
                  <span className="w-3 h-3 rounded-full bg-[#27C93F]" />
                </div>
                <div className="flex-1 max-w-sm mx-auto text-center text-xs font-medium text-muted bg-white border border-slate-200 rounded-md py-1 truncate">
                  Stockpot · Menu &amp; Master Recipes
                </div>
                <span className="w-12 hidden sm:block" aria-hidden="true" />
              </div>
              <img src="/landing/recipes.webp" alt="Stockpot's recipe costing screen, showing cost, margin and suggested price" width={1152} height={820} className="w-full h-auto block" />
            </motion.div>
          </div>
        </section>

        {/* Problem */}
        <section className={`${BAND} ${SECTION}`}>
          <div className={WRAP}>
            <Reveal className="text-center max-w-2xl mx-auto mb-10 sm:mb-12">
              <h2 className={`${DISPLAY} text-3xl sm:text-4xl font-bold tracking-tight mb-3`}>
                The hidden leaks eating kitchen profits
              </h2>
              <p className="text-lg text-muted">Gut feelings and static notebooks lead to silent margin compression.</p>
            </Reveal>
            <div className="grid md:grid-cols-3 gap-5 lg:gap-6">
              {PROBLEMS.map(({ icon: Icon, tone, title, body }, i) => (
                <Reveal key={title} delay={i * 0.08} className={`${CARD} border-[#D0E4E2] ${CARD_HOVER} p-6 lg:p-7`}>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${tone}`}>
                    <Icon size={24} />
                  </div>
                  <h3 className={`${DISPLAY} text-lg lg:text-xl font-bold mb-2`}>{title}</h3>
                  <p className="text-muted leading-relaxed">{body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className={`scroll-mt-16 ${SECTION}`}>
          <div className={WRAP}>
            <Reveal className="text-center max-w-2xl mx-auto mb-10 sm:mb-12">
              <Eyebrow>Kitchen OS</Eyebrow>
              <h2 className={`${DISPLAY} text-3xl sm:text-4xl font-bold tracking-tight mb-3`}>
                A metric-first kitchen operating system
              </h2>
              <p className="text-lg text-muted">Instant calculations, live stock balances and clear margins, in one place.</p>
            </Reveal>

            <div className="grid grid-cols-1 lg:grid-cols-6 gap-5 lg:gap-6">
              {TILES.map(({ icon: Icon, tag, title, body, images, span }, i) => (
                <Reveal key={title} delay={(i % 2) * 0.08} className={`${CARD} ${CARD_HOVER} overflow-hidden flex flex-col ${span}`}>
                  <div className="p-6 lg:p-7 pb-5">
                    <div className="inline-flex items-center gap-2 text-primary bg-surface px-2.5 py-1 rounded-md mb-4">
                      <Icon size={16} />
                      <span className="text-xs font-semibold">{tag}</span>
                    </div>
                    <h3 className={`${DISPLAY} text-xl lg:text-2xl font-bold tracking-tight mb-2`}>{title}</h3>
                    <p className="text-muted leading-relaxed">{body}</p>
                  </div>
                  <div className={`mt-auto px-5 lg:px-6 grid gap-3 ${images.length > 1 ? 'sm:grid-cols-2' : ''}`}>
                    {images.map(img => (
                      <div key={img.src} className="h-52 sm:h-60 rounded-t-xl overflow-hidden border border-b-0 border-slate-200 bg-surface">
                        <Shot src={img.src} alt={img.alt} />
                      </div>
                    ))}
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className={`scroll-mt-16 ${BAND} ${SECTION}`}>
          <div className={WRAP}>
            <Reveal className="text-center max-w-2xl mx-auto mb-10 sm:mb-12">
              <Eyebrow tone="white">Simple workflow</Eyebrow>
              <h2 className={`${DISPLAY} text-3xl sm:text-4xl font-bold tracking-tight`}>
                From ingredients to real profit in four steps
              </h2>
            </Reveal>
            <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-6">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex">
                  <Reveal delay={i * 0.07} className={`${CARD} border-[#D0E4E2] p-6 flex flex-col w-full`}>
                    <div className={`${DISPLAY} w-11 h-11 rounded-xl bg-primary text-white flex items-center justify-center font-bold text-lg shadow-sm mb-4`}>
                      {String(i + 1).padStart(2, '0')}
                    </div>
                    <h3 className={`${DISPLAY} text-lg font-bold mb-1.5`}>{step.title}</h3>
                    <p className="text-sm text-muted leading-relaxed mb-5">{step.body}</p>
                    <span className="mt-auto self-start px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono font-medium text-ink">
                      {step.chip}
                    </span>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className={`scroll-mt-16 ${SECTION}`}>
          <div className={WRAP}>
            <Reveal className="text-center max-w-2xl mx-auto mb-10">
              <h2 className={`${DISPLAY} text-3xl sm:text-4xl font-bold tracking-tight mb-3`}>One plan. Everything included.</h2>
              <p className="text-lg text-muted">
                Start free for {TRIAL_DAYS} days. A card is required to start, and you won&apos;t be charged if you cancel before the trial ends.
              </p>
            </Reveal>
            <Reveal className={`${CARD} max-w-5xl mx-auto border-2 border-primary p-6 sm:p-9 shadow-[0_24px_48px_-12px_rgba(0,121,123,0.16)]`}>
              <div className="grid md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-8 md:gap-10 items-center">
                <div>
                  <div className="flex items-start justify-between gap-3 mb-5">
                    <div>
                      <h3 className={`${DISPLAY} text-2xl font-bold`}>Stockpot Pro</h3>
                      <p className="text-sm text-muted mt-0.5">All features, unlimited access</p>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-surface border border-[#D0E4E2] text-primary text-xs font-semibold whitespace-nowrap">{TRIAL_DAYS}-Day Free Trial</span>
                  </div>
                  <div className="mb-6 flex items-baseline gap-1.5">
                    <span className={`${DISPLAY} text-5xl font-bold tracking-tight tabular-nums`}>{PRICE.symbol}{PRICE.amount}</span>
                    <span className="text-muted font-medium">/ {PRICE.period}</span>
                  </div>
                  <Link to="/app" className={`${BTN_PRIMARY} w-full`}>Start Free Trial</Link>
                  <p className="text-center text-xs text-muted mt-3">Cancel anytime from Settings → Manage Billing.</p>
                </div>
                <ul className="space-y-4 md:border-l md:border-slate-200 md:pl-10">
                  {PLAN_FEATURES.map(f => (
                    <li key={f} className="flex items-start gap-3">
                      <CircleCheck size={20} className="text-primary shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className={`scroll-mt-16 ${BAND} ${SECTION}`}>
          <div className={`${WRAP} grid lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] gap-8 lg:gap-14`}>
            <Reveal className="text-center lg:text-left lg:pt-2">
              <h2 className={`${DISPLAY} text-3xl sm:text-4xl font-bold tracking-tight mb-3`}>Questions, answered</h2>
              <p className="text-lg text-muted">Everything you need to know about Stockpot.</p>
            </Reveal>
            <div className="space-y-3">
              {FAQS.map(({ q, a }, i) => {
                const open = openFaq === i;
                return (
                  <div key={q} className={`${CARD} border-[#D0E4E2] overflow-hidden`}>
                    <h3>
                      <button
                        type="button"
                        onClick={() => setOpenFaq(open ? null : i)}
                        aria-expanded={open}
                        aria-controls={`faq-panel-${i}`}
                        id={`faq-button-${i}`}
                        className="w-full flex items-center justify-between gap-4 text-left px-5 sm:px-6 py-5 font-semibold hover:text-primary transition-colors"
                      >
                        <span>{q}</span>
                        <ChevronDown size={20} className={`shrink-0 text-primary transition-transform ${open ? 'rotate-180' : ''}`} />
                      </button>
                    </h3>
                    <div id={`faq-panel-${i}`} role="region" aria-labelledby={`faq-button-${i}`} hidden={!open} className="px-5 sm:px-6 pb-5 -mt-1 text-muted leading-relaxed">
                      {a}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className={SECTION}>
          <div className={WRAP}>
            <Reveal className="relative rounded-[20px] bg-primary text-white text-center px-6 py-14 sm:py-16 overflow-hidden shadow-xl">
              <div className="pointer-events-none absolute -top-24 right-0 w-[28rem] h-[28rem] rounded-full bg-white/10 blur-3xl" />
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center mx-auto mb-6">
                  <PiggyBank size={28} />
                </div>
                <h2 className={`${DISPLAY} text-3xl sm:text-4xl font-bold tracking-tight mb-3`}>Stop guessing your margins.</h2>
                <p className="text-lg text-white/90 mb-8">Start your {TRIAL_DAYS}-day free trial — cancel anytime before it ends.</p>
                <Link to="/app" className="inline-flex items-center justify-center gap-2 h-12 px-8 rounded-xl bg-white text-primary font-bold hover:bg-surface transition-colors shadow-md">
                  Get Started Free <ArrowRight size={18} />
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 pt-12 pb-8">
        <div className={`${WRAP} grid gap-10 md:grid-cols-[1.6fr_1fr_1fr]`}>
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <img src="/logo-icon.png" alt="" className="w-8 h-8" />
              <span className={`${DISPLAY} text-xl font-bold tracking-tight`}>Stockpot</span>
            </div>
            <p className="text-muted max-w-xs text-sm">Inventory, recipe costing and margin tracking for craft food businesses.</p>
          </div>
          <nav aria-label="Product" className="flex flex-col gap-2.5 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink mb-1">Product</span>
            <a href="#features" className="text-muted hover:text-primary transition-colors">Features</a>
            <a href="#pricing" className="text-muted hover:text-primary transition-colors">Pricing</a>
            <Link to="/app" className="text-muted hover:text-primary transition-colors">Demo</Link>
          </nav>
          <nav aria-label="Legal" className="flex flex-col gap-2.5 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink mb-1">Legal</span>
            <Link to="/terms" className="text-muted hover:text-primary transition-colors">Terms of Service</Link>
            <Link to="/privacy" className="text-muted hover:text-primary transition-colors">Privacy Policy</Link>
          </nav>
        </div>
        <div className={`${WRAP} mt-10`}>
          <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-muted">
            <span>&copy; {new Date().getFullYear()} Stockpot. All rights reserved.</span>
            <span>Built for kitchen founders in India.</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
