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
 * never promises a screen the product doesn't have.
 *
 * What the page says about billing has to match server.ts: the free trial is
 * 14 days and Stripe Checkout collects a card to start it, so the copy says a
 * card is required and never "no credit card". The monthly price is defined
 * once here; it must equal the Stripe price in STRIPE_PRICE_ID.
 */
const PRICE = { symbol: '$', amount: '49', period: 'month' };
const TRIAL_DAYS = 14;

const DISPLAY = "font-['Space_Grotesk',ui-sans-serif,system-ui,sans-serif]";
const BODY = "font-['Inter',ui-sans-serif,system-ui,sans-serif]";

const CARD = 'bg-white rounded-3xl border border-slate-200 shadow-[0_1px_2px_0_rgba(43,49,61,0.04)]';
const CARD_HOVER = 'transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_12px_24px_-4px_rgba(43,49,61,0.08),0_4px_8px_-2px_rgba(43,49,61,0.04)]';
const BTN_PRIMARY = 'inline-flex items-center justify-center gap-2 h-12 px-7 rounded-xl bg-primary hover:bg-primary-dark text-white font-semibold shadow-md shadow-primary/20 transition-colors';
const BTN_SECONDARY = 'inline-flex items-center justify-center gap-2 h-12 px-7 rounded-xl bg-white hover:bg-slate-50 text-ink font-semibold border border-slate-200 hover:border-slate-300 transition-colors';

const FAQS: { q: string; a: string }[] = [
  { q: 'Do I need a GST number to use Stockpot?', a: 'No — GST tracking is optional and only turns on if you enable it in Settings.' },
  { q: 'Do I need an accounting background?', a: 'Not at all. If you know your ingredient costs, Stockpot does the rest.' },
  { q: 'What currency does it support?', a: 'Pick your currency from the selector in the app; it applies everywhere.' },
  { q: 'Is my data safe?', a: "Your data is stored in Google's Firebase cloud, and each account can only read and write its own data." },
  { q: 'Can I cancel anytime?', a: 'Yes — from Settings → User Account → Manage Billing. No lock-in.' },
  {
    q: 'Can I try it before I pay?',
    a: `Yes. The ${TRIAL_DAYS}-day trial is free — a card is required to start it, and you won't be charged if you cancel before it ends. You can also explore the demo sandbox from the sign-in screen without signing up.`,
  },
];

const PROBLEMS = [
  { icon: TrendingDown, title: "You don't actually know your margins", body: "Ingredient prices creep up, but your prices don't. By the time you notice, you've been selling at a loss for months." },
  { icon: Table2, title: "Spreadsheets don't scale", body: 'One typo in a formula throws off your whole cost sheet. Nobody has time to manually update 40 recipes every time flour gets more expensive.' },
  { icon: Trash2, title: 'Waste is invisible', body: 'Spoiled ingredients and unsold batches quietly eat your profit — and most tools never show you the number.' },
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
    icon: BookOpen, tag: 'Recipe engine', span: 'md:col-span-4',
    title: 'Recipe Costing — Every recipe, priced to the gram',
    body: "Add your ingredients once. Stockpot calculates exact recipe cost and margin automatically, and suggests a price if you don't know where to start.",
    images: [{ src: '/landing/recipes.webp', alt: 'Menu & Master Recipes in Stockpot' }],
  },
  {
    icon: Boxes, tag: 'Inventory control', span: 'md:col-span-2',
    title: 'Inventory Tracking — Never run out mid-batch',
    body: "Real-time stock levels for raw materials and packaging, with low-stock alerts before you're caught short.",
    images: [{ src: '/landing/inventory.webp', alt: 'Raw materials and stock alerts' }],
  },
  {
    icon: Factory, tag: 'Smart batching', span: 'md:col-span-3',
    title: 'Production Log — Log a batch, and stock updates itself',
    body: 'Recording a production run deducts ingredients and adds finished stock automatically. No manual math, no double entry.',
    images: [{ src: '/landing/production.webp', alt: 'Production runs and finished goods' }],
  },
  {
    icon: Truck, tag: 'Order management', span: 'md:col-span-3',
    title: 'Orders & Delivery — Every order, every delivery cost, tracked',
    body: 'Multi-item orders, fulfilment status, and what you charge vs. pay for delivery — all feeding straight into your margins.',
    images: [{ src: '/landing/orders.webp', alt: 'Customer & courier orders' }],
  },
  {
    icon: Landmark, tag: 'Compliance', span: 'md:col-span-2',
    title: 'GST Ready — Tax-ready the moment you need it (India)',
    body: 'Turn on GST tracking whenever you register. Inclusive or exclusive pricing, tracked separately from your base costs.',
    images: [{ src: '/landing/gst.webp', alt: 'Business profile and GST settings' }],
  },
  {
    icon: FlaskConical, tag: 'Audit & testing', span: 'md:col-span-4',
    title: 'Wastage & R&D — See what spoilage really costs',
    body: 'Log wastage and recipe experiments separately from your real numbers, so testing a new item never messes with your books.',
    images: [
      { src: '/landing/wastage.webp', alt: 'Wastage & loss ledger' },
      { src: '/landing/rnd.webp', alt: 'R&D test kitchen' },
    ],
  },
];

const STEPS = [
  { title: 'Add your ingredients & their cost', body: 'Stock quantities, units, and price per unit, once.', src: '/landing/add-item.webp', alt: 'Adding an ingredient to inventory' },
  { title: 'Build your recipes', body: 'Stockpot costs them instantly and shows your margin.', src: '/landing/recipes.webp', alt: 'Building a recipe' },
  { title: 'Log orders & production as you go', body: 'Stock and costs update themselves.', src: '/landing/add-order.webp', alt: 'Logging an order' },
  { title: 'Watch your real profit, every day', body: 'One dashboard, no spreadsheet required.', src: '/landing/dashboard.webp', alt: 'The profit dashboard' },
];

const PLAN_FEATURES = [
  'Unlimited menu items & recipes',
  'Inventory & production tracking',
  'Cost & profit margin analysis',
  'GST tracking (India)',
  'Shopify / Odoo order import',
  'Priority email support',
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
    <div className={`min-h-screen bg-surface text-ink ${BODY} selection:bg-primary/20 overflow-x-hidden`}>
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
          <a href="#top" className="flex items-center gap-2.5" aria-label="Stockpot home">
            <img src="/logo-icon.png" alt="" className="w-8 h-8" />
            <span className={`${DISPLAY} text-xl font-bold tracking-tight`}>Stockpot</span>
          </a>
          <nav aria-label="Sections" className="hidden md:flex items-center gap-8 text-sm font-medium text-muted">
            <a href="#features" className="hover:text-primary transition-colors">Features</a>
            <a href="#pricing" className="hover:text-primary transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-primary transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link to="/app" className="text-sm font-semibold text-ink hover:text-primary transition-colors px-2">Log In</Link>
            <Link to="/app" className="inline-flex items-center gap-1.5 h-10 px-4 sm:px-5 rounded-lg bg-primary hover:bg-primary-dark text-white text-sm font-semibold transition-colors">
              <span className="hidden sm:inline">Start Free Trial</span>
              <span className="sm:hidden">Try free</span>
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero */}
        <section className="relative px-4 sm:px-8 pt-16 sm:pt-24 pb-16 sm:pb-24">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-gradient-to-b from-primary/10 to-transparent" />
          <div className="relative max-w-5xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-semibold text-muted mb-7"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-margin" />
              Built for home bakers, home chefs &amp; small food businesses
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.08 }}
              className={`${DISPLAY} text-4xl sm:text-6xl font-bold tracking-[-0.03em] leading-[1.1] mb-6`}
            >
              Know your real margins.<br />
              <span className="text-primary">Down to the last gram.</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.16 }}
              className="text-lg sm:text-xl text-muted max-w-2xl mx-auto leading-relaxed mb-9"
            >
              Stockpot tracks your ingredients, costs every recipe automatically, and shows you the profit you&apos;re actually making — so pricing stops being a guess.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.24 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-3"
            >
              <Link to="/app" className={`${BTN_PRIMARY} w-full sm:w-auto`}>
                Start your {TRIAL_DAYS}-day free trial
              </Link>
              <Link to="/app" className={`${BTN_SECONDARY} w-full sm:w-auto`}>
                Explore the demo <ArrowRight size={16} />
              </Link>
            </motion.div>
            <p className="mt-5 text-sm text-muted">
              Card required to start · Free for {TRIAL_DAYS} days · Cancel anytime
            </p>

            {/* Product frame */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.35 }}
              className="mt-14 sm:mt-20 mx-auto rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-[0_24px_48px_-12px_rgba(0,121,123,0.14)] text-left"
            >
              <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200">
                <div className="flex gap-1.5" aria-hidden="true">
                  <span className="w-3 h-3 rounded-full bg-slate-300" />
                  <span className="w-3 h-3 rounded-full bg-slate-300" />
                  <span className="w-3 h-3 rounded-full bg-slate-300" />
                </div>
                <div className="flex-1 max-w-sm mx-auto text-center text-xs font-medium text-muted bg-white border border-slate-200 rounded-md py-1">
                  Stockpot · Performance Summary
                </div>
                <span className="w-12" aria-hidden="true" />
              </div>
              <img src="/landing/dashboard.webp" alt="Stockpot's Performance Summary dashboard" width={1440} height={900} className="w-full h-auto block" />
            </motion.div>
          </div>
        </section>

        {/* Problem */}
        <section className="bg-white border-y border-slate-200 px-4 sm:px-8 py-16 sm:py-24">
          <div className="max-w-6xl mx-auto">
            <Reveal className="text-center max-w-2xl mx-auto mb-12">
              <h2 className={`${DISPLAY} text-3xl sm:text-4xl font-semibold tracking-tight mb-4`}>
                Running a food business on a notebook and a gut feeling?
              </h2>
              <p className="text-lg text-muted">You&apos;re not alone — and it&apos;s costing you more than you think.</p>
            </Reveal>
            <div className="grid md:grid-cols-3 gap-6">
              {PROBLEMS.map(({ icon: Icon, title, body }, i) => (
                <Reveal key={title} delay={i * 0.08} className={`${CARD} ${CARD_HOVER} p-7`}>
                  <div className="w-12 h-12 rounded-xl bg-coral/10 text-coral flex items-center justify-center mb-5">
                    <Icon size={24} />
                  </div>
                  <h3 className={`${DISPLAY} text-xl font-semibold mb-2`}>{title}</h3>
                  <p className="text-muted leading-relaxed">{body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-16 px-4 sm:px-8 py-16 sm:py-24">
          <div className="max-w-7xl mx-auto">
            <Reveal className="text-center max-w-2xl mx-auto mb-12">
              <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider mb-4">Kitchen OS</span>
              <h2 className={`${DISPLAY} text-3xl sm:text-4xl font-semibold tracking-tight mb-4`}>
                Everything your kitchen&apos;s books actually need
              </h2>
              <p className="text-lg text-muted">Not generic accounting software — built around how a food business really runs.</p>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
              {TILES.map(({ icon: Icon, tag, title, body, images, span }, i) => (
                <Reveal key={title} delay={(i % 2) * 0.08} className={`${CARD} ${CARD_HOVER} overflow-hidden flex flex-col ${span}`}>
                  <div className="p-7 pb-5">
                    <div className="inline-flex items-center gap-2 text-primary mb-4">
                      <Icon size={18} />
                      <span className="text-xs font-semibold uppercase tracking-wider">{tag}</span>
                    </div>
                    <h3 className={`${DISPLAY} text-xl sm:text-2xl font-semibold tracking-tight mb-2`}>{title}</h3>
                    <p className="text-muted leading-relaxed">{body}</p>
                  </div>
                  <div className={`mt-auto px-5 pb-0 grid gap-3 ${images.length > 1 ? 'sm:grid-cols-2' : ''}`}>
                    {images.map(img => (
                      <div key={img.src} className="h-56 sm:h-64 rounded-t-xl overflow-hidden border border-b-0 border-slate-200 bg-surface">
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
        <section className="bg-white border-y border-slate-200 px-4 sm:px-8 py-16 sm:py-24">
          <div className="max-w-6xl mx-auto">
            <Reveal className="text-center max-w-2xl mx-auto mb-12">
              <span className="inline-block px-3 py-1 rounded-full bg-margin/10 text-[#006143] text-xs font-semibold uppercase tracking-wider mb-4">Simple workflow</span>
              <h2 className={`${DISPLAY} text-3xl sm:text-4xl font-semibold tracking-tight`}>
                From ingredients to real profit, in four steps
              </h2>
            </Reveal>
            <ol className="grid md:grid-cols-2 gap-6">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex">
                  <Reveal delay={(i % 2) * 0.08} className={`${CARD} overflow-hidden flex flex-col w-full`}>
                    <div className="p-7 flex items-start gap-4">
                      <div className={`${DISPLAY} w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center font-bold shrink-0`}>{i + 1}</div>
                      <div>
                        <h3 className={`${DISPLAY} text-xl font-semibold mb-1`}>{step.title}</h3>
                        <p className="text-muted">{step.body}</p>
                      </div>
                    </div>
                    <div className="mt-auto mx-5 h-56 rounded-t-xl overflow-hidden border border-b-0 border-slate-200 bg-surface">
                      <Shot src={step.src} alt={step.alt} />
                    </div>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-16 px-4 sm:px-8 py-16 sm:py-24">
          <div className="max-w-xl mx-auto">
            <Reveal className="text-center mb-10">
              <h2 className={`${DISPLAY} text-3xl sm:text-4xl font-semibold tracking-tight mb-4`}>One plan. Everything included.</h2>
              <p className="text-lg text-muted">
                Start free for {TRIAL_DAYS} days. A card is required to start, and you won&apos;t be charged if you cancel before the trial ends.
              </p>
            </Reveal>
            <Reveal className={`${CARD} p-8 shadow-[0_24px_48px_-12px_rgba(0,121,123,0.12)]`}>
              <div className="flex items-start justify-between gap-3 mb-6">
                <div>
                  <h3 className={`${DISPLAY} text-2xl font-semibold`}>Stockpot Pro</h3>
                  <p className="text-muted">All features, unlimited access</p>
                </div>
                <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold whitespace-nowrap">{TRIAL_DAYS}-Day Free Trial</span>
              </div>
              <div className="mb-7 flex items-baseline gap-1.5">
                <span className={`${DISPLAY} text-5xl font-bold tracking-tight tabular-nums`}>{PRICE.symbol}{PRICE.amount}</span>
                <span className="text-muted">/ {PRICE.period}</span>
              </div>
              <ul className="space-y-3.5 mb-8">
                {PLAN_FEATURES.map(f => (
                  <li key={f} className="flex items-center gap-3">
                    <CircleCheck size={20} className="text-margin shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link to="/app" className={`${BTN_PRIMARY} w-full`}>Start Free Trial</Link>
              <p className="text-center text-sm text-muted mt-4">Cancel anytime from Settings → Manage Billing.</p>
            </Reveal>
            <p className="text-center text-sm text-muted mt-8">More plans for larger teams and multiple locations are coming soon.</p>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-16 bg-white border-y border-slate-200 px-4 sm:px-8 py-16 sm:py-24">
          <div className="max-w-3xl mx-auto">
            <Reveal className="text-center mb-10">
              <h2 className={`${DISPLAY} text-3xl sm:text-4xl font-semibold tracking-tight mb-3`}>Questions, answered</h2>
              <p className="text-lg text-muted">Everything you need to know about Stockpot</p>
            </Reveal>
            <div className="space-y-3">
              {FAQS.map(({ q, a }, i) => {
                const open = openFaq === i;
                return (
                  <div key={q} className={`${CARD} overflow-hidden`}>
                    <h3>
                      <button
                        type="button"
                        onClick={() => setOpenFaq(open ? null : i)}
                        aria-expanded={open}
                        aria-controls={`faq-panel-${i}`}
                        id={`faq-button-${i}`}
                        className="w-full flex items-center justify-between gap-4 text-left px-6 py-5 font-semibold hover:text-primary transition-colors"
                      >
                        <span>{q}</span>
                        <ChevronDown size={20} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
                      </button>
                    </h3>
                    <div id={`faq-panel-${i}`} role="region" aria-labelledby={`faq-button-${i}`} hidden={!open} className="px-6 pb-5 -mt-1 text-muted leading-relaxed">
                      {a}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-4 sm:px-8 py-16 sm:py-24">
          <Reveal className="relative max-w-4xl mx-auto rounded-3xl bg-primary text-white text-center px-6 py-14 sm:py-16 overflow-hidden">
            <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[32rem] h-[32rem] rounded-full bg-white/10 blur-3xl" />
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center mx-auto mb-6">
                <PiggyBank size={28} />
              </div>
              <h2 className={`${DISPLAY} text-3xl sm:text-4xl font-semibold tracking-tight mb-3`}>Stop guessing your margins.</h2>
              <p className="text-lg text-white/85 mb-8">Start your {TRIAL_DAYS}-day free trial — cancel anytime before it ends.</p>
              <Link to="/app" className="inline-flex items-center justify-center gap-2 h-12 px-8 rounded-xl bg-white text-primary font-semibold hover:bg-surface transition-colors shadow-lg">
                Get Started Free <ArrowRight size={18} />
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 px-4 sm:px-8 py-12">
        <div className="max-w-6xl mx-auto grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <img src="/logo-icon.png" alt="" className="w-8 h-8" />
              <span className={`${DISPLAY} text-xl font-bold tracking-tight`}>Stockpot</span>
            </div>
            <p className="text-muted max-w-xs">Inventory and margin tracking, built for food businesses.</p>
          </div>
          <nav aria-label="Product" className="flex flex-col gap-2.5 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted mb-1">Product</span>
            <a href="#features" className="hover:text-primary transition-colors">Features</a>
            <a href="#pricing" className="hover:text-primary transition-colors">Pricing</a>
            <Link to="/app" className="hover:text-primary transition-colors">Demo</Link>
          </nav>
          <nav aria-label="Legal" className="flex flex-col gap-2.5 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted mb-1">Legal</span>
            <Link to="/terms" className="hover:text-primary transition-colors">Terms of Service</Link>
            <Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
          </nav>
        </div>
        <div className="max-w-6xl mx-auto mt-10 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-muted">
          <span>&copy; {new Date().getFullYear()} Stockpot. All rights reserved.</span>
          <span>Precision crafted for kitchen makers.</span>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
