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

interface TextTile {
  icon: React.ElementType;
  tag: string;
  title: string;
  body: string;
  points: string[];
}

const TEXT_TILES: TextTile[] = [
  {
    icon: BookOpen, tag: 'Recipe engine',
    title: 'Real-time recipe costing, to the gram',
    body: 'Change the cost of an ingredient once, and every menu item recalculates its cost, margin and suggested price automatically.',
    points: [
      'Cost, margin and a suggested price for every menu item',
      'Amounts in g, kg, ml, l or pieces, converted for you',
      'Packaging materials costed alongside ingredients',
      'Estimated nutrition per serving',
    ],
  },
  {
    icon: Boxes, tag: 'Smart inventory',
    title: 'Never run out mid-bake',
    body: 'Live stock for raw materials and packaging, with low-stock alerts before you are caught short.',
    points: [
      'Current stock, alert level and status for every material',
      'Low-stock alerts with a Restock button',
      'Raw materials and packaging in their own categories',
      'Import from a CSV, with a template to start from',
    ],
  },
  {
    icon: Factory, tag: 'Batch yields',
    title: 'Automated stock logs',
    body: 'Logging a production run deducts the ingredients and adds finished stock, so there is no manual math and no double entry.',
    points: [
      'Record how many you made and how many are sellable after waste',
      'Batch cost is saved with every run',
      'Shelf life and expiry dates, with freshness alerts',
      'Sell, use for an order or discard leftover market stock',
    ],
  },
  {
    icon: Truck, tag: 'Orders & delivery',
    title: 'True fulfilment profitability',
    body: 'Every order feeds straight into your margins, including what delivery really costs you.',
    points: [
      'Multi-item orders with customer name and phone',
      'Pending and fulfilled status, filtered by date range',
      'Pickup, self-delivery or third-party courier',
      'Delivery charged to the customer vs. fee paid to the courier',
    ],
  },
  {
    icon: Landmark, tag: 'GST & compliance',
    title: 'Built for India',
    body: 'Switch GST on when you register. It is tracked separately from your food margins.',
    points: [
      'Your own GST rate, with inclusive or exclusive pricing',
      'GST collected on sales shown on the dashboard',
      'GST paid on each ingredient you buy, set per material',
      'Prices in rupees (₹) by default',
    ],
  },
  {
    icon: FlaskConical, tag: 'Audit & testing',
    title: 'See what spoilage really costs',
    body: 'Wastage and recipe experiments each get their own ledger, so you can see exactly what spoilage and testing cost you.',
    points: [
      'Wastage ledger by reason: expired, spilled, sampling and more',
      'Cost impact of every discarded ingredient or finished item',
      'R&D test kitchen with the cost of each trial',
      'Trial ingredients show as a separate R&D expense on the dashboard',
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
        {/* Hero: banner photo, headline and calls to action, then the product frame; one full-width column */}
        <section className="relative pt-8 sm:pt-12 pb-14 sm:pb-20">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-gradient-to-b from-primary/10 to-transparent" />
          <div className={`${WRAP} relative`}>
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="rounded-[20px] overflow-hidden border border-slate-200 shadow-md bg-white"
            >
              <picture>
                <source media="(min-width: 1024px)" srcSet="/landing/banner-wide.webp" width={1376} height={768} />
                <img
                  src="/landing/banner-tablet.webp"
                  alt="Stockpot inventory and margin tracking on a tablet, beside a notebook, scales and fresh bread on a bakery counter"
                  width={1200}
                  height={896}
                  className="w-full h-auto block"
                />
              </picture>
            </motion.div>

            <div className="text-center max-w-4xl mx-auto mt-10 sm:mt-14">
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.08 }}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface border border-[#D0E4E2] text-xs font-semibold text-primary mb-6"
              >
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Built for home bakers, chefs &amp; small food businesses
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.14 }}
                className={`${DISPLAY} text-4xl sm:text-5xl lg:text-6xl font-bold tracking-[-0.03em] leading-[1.1] mb-5`}
              >
                Know your real margins.<br className="hidden sm:block" />{' '}
                <span className="text-primary">Down to the last gram.</span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="text-lg sm:text-xl text-muted max-w-2xl mx-auto leading-relaxed mb-8"
              >
                Stockpot tracks your ingredients in real time, costs every recipe automatically, and shows which items are priced too low, so you never sell at a loss by accident.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.26 }}
                className="flex flex-col sm:flex-row items-center justify-center gap-3"
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
              className="mt-12 sm:mt-16 max-w-6xl mx-auto rounded-[20px] bg-white border border-slate-200 overflow-hidden shadow-[0_24px_48px_-12px_rgba(0,121,123,0.18)] text-left"
            >
              <div className="flex items-center gap-3 px-4 py-3 bg-slate-100 border-b border-slate-200">
                <div className="flex gap-1.5" aria-hidden="true">
                  <span className="w-3 h-3 rounded-full bg-[#FF5F56]" />
                  <span className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
                  <span className="w-3 h-3 rounded-full bg-[#27C93F]" />
                </div>
                <div className="flex-1 max-w-sm mx-auto text-center text-xs font-medium text-muted bg-white border border-slate-200 rounded-md py-1 truncate">
                  Stockpot · Performance Summary
                </div>
                <span className="w-12 hidden sm:block" aria-hidden="true" />
              </div>
              <img src="/landing/dashboard.webp" alt="Stockpot's Performance Summary dashboard, showing income, costs and net profit" width={1440} height={900} className="w-full h-auto block" />
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

            {/* One composition: the recipe screen on a laptop, the stock screen on a phone */}
            <Reveal className="relative max-w-6xl mx-auto mb-14 sm:mb-16 lg:mb-20">
              <div className="md:w-[90%]">
                <div className="rounded-t-2xl border-[10px] border-b-0 border-ink bg-ink shadow-[0_24px_48px_-12px_rgba(43,49,61,0.35)]">
                  <img src="/landing/device-laptop.webp" alt="Stockpot's recipe costing screen on a laptop" width={1440} height={900} loading="lazy" decoding="async" className="w-full h-auto block rounded-t-md" />
                </div>
                <div className="h-3 sm:h-4 mx-[-2%] rounded-b-2xl bg-gradient-to-b from-slate-300 to-slate-400 shadow-md" aria-hidden="true">
                  <div className="mx-auto w-24 h-1 rounded-b bg-slate-500/60" />
                </div>
              </div>
              <div className="mt-8 mx-auto w-40 sm:w-48 md:mt-0 md:absolute md:right-0 md:bottom-[-2.5rem] md:w-[21%] md:min-w-[150px]">
                <div className="rounded-[2rem] border-[7px] border-ink bg-ink shadow-[0_24px_48px_-12px_rgba(43,49,61,0.4)] overflow-hidden">
                  <img src="/landing/device-phone.webp" alt="Stockpot's stock alerts on a phone" width={780} height={1560} loading="lazy" decoding="async" className="w-full h-auto block rounded-[1.5rem]" />
                </div>
              </div>
            </Reveal>

            <Reveal className="relative h-52 sm:h-64 lg:h-72 rounded-[20px] overflow-hidden border border-slate-200 shadow-sm mb-5 lg:mb-6">
              <img src="/landing/pastries.webp" alt="Croissants, pain au chocolat and bread on a rustic bakery counter" loading="lazy" decoding="async" className="w-full h-full object-cover" />
              <span className="absolute bottom-3 left-3 px-3 py-1.5 rounded-md bg-ink/80 backdrop-blur-sm text-white text-xs font-medium">Every bake, costed to the gram</span>
            </Reveal>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 lg:gap-6">
              {TEXT_TILES.map(({ icon: Icon, tag, title, body, points }, i) => (
                <Reveal key={title} delay={(i % 2) * 0.08} className={`${CARD} ${CARD_HOVER} p-6 lg:p-7 flex flex-col`}>
                  <div className="inline-flex self-start items-center gap-2 text-primary bg-surface px-2.5 py-1 rounded-md mb-4">
                    <Icon size={16} />
                    <span className="text-xs font-semibold">{tag}</span>
                  </div>
                  <h3 className={`${DISPLAY} text-xl font-bold tracking-tight mb-2`}>{title}</h3>
                  <p className="text-muted leading-relaxed mb-5">{body}</p>
                  <ul className="mt-auto space-y-2.5 text-sm">
                    {points.map(pt => (
                      <li key={pt} className="flex items-start gap-2.5">
                        <CircleCheck size={16} className="text-primary shrink-0 mt-0.5" />
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
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
            <Reveal className={`${CARD} max-w-2xl mx-auto border-2 border-primary p-6 sm:p-9 shadow-[0_24px_48px_-12px_rgba(0,121,123,0.16)]`}>
              <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                  <h3 className={`${DISPLAY} text-2xl font-bold`}>Stockpot Pro</h3>
                  <p className="text-sm text-muted mt-0.5">All features, unlimited access</p>
                </div>
                <span className="px-3 py-1 rounded-full bg-surface border border-[#D0E4E2] text-primary text-xs font-semibold whitespace-nowrap">{TRIAL_DAYS}-Day Free Trial</span>
              </div>
              <div className="mb-6 pb-6 border-b border-slate-200 flex items-baseline gap-1.5">
                <span className={`${DISPLAY} text-5xl font-bold tracking-tight tabular-nums`}>{PRICE.symbol}{PRICE.amount}</span>
                <span className="text-muted font-medium">/ {PRICE.period}</span>
              </div>
              <ul className="space-y-3.5 mb-7">
                {PLAN_FEATURES.map(f => (
                  <li key={f} className="flex items-start gap-3">
                    <CircleCheck size={20} className="text-primary shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link to="/app" className={`${BTN_PRIMARY} w-full`}>Start Free Trial</Link>
              <p className="text-center text-xs text-muted mt-3">Cancel anytime from Settings → Manage Billing.</p>
            </Reveal>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className={`scroll-mt-16 ${BAND} ${SECTION}`}>
          <div className={WRAP}>
            <Reveal className="text-center max-w-2xl mx-auto mb-10">
              <h2 className={`${DISPLAY} text-3xl sm:text-4xl font-bold tracking-tight mb-3`}>Questions, answered</h2>
              <p className="text-lg text-muted">Everything you need to know about Stockpot.</p>
            </Reveal>
            <div className="max-w-3xl mx-auto space-y-3">
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

        {/* Final CTA, over a bakery photo */}
        <section className={SECTION}>
          <div className={WRAP}>
            <Reveal className="relative rounded-[20px] text-white text-center px-6 py-16 sm:py-20 overflow-hidden shadow-xl bg-primary">
              <img src="/landing/sourdough.webp" alt="" aria-hidden="true" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-primary/85" />
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
