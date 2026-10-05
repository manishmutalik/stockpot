import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowRight, Boxes, ChevronDown, CircleCheck, IndianRupee, MessageCircle, Receipt, Send, Sun, TrendingUp
} from 'lucide-react';
import { TRIAL_DAYS } from './utils/trial';

/**
 * The public landing page. Every screenshot below is a real capture of the
 * app running on the demo kitchen's data (see public/landing/), so the page
 * never promises a screen the product doesn't have, and nothing on it is an
 * invented statistic or testimonial. It only describes features that are live.
 *
 * What the page says about billing has to match the server: the free trial
 * length is TRIAL_DAYS (src/utils/trial.ts, shared with the server) and
 * Razorpay collects a payment mandate to start it, so the copy says a card is
 * required and never "no credit card". The monthly price is defined once here;
 * it must equal the amount of the Razorpay plan in RAZORPAY_PLAN_ID (in INR).
 * It does not say whether the price includes GST: the plan is to make ₹1,200
 * inclusive once the business is GST-registered (see docs/PROJECT_STATE.md);
 * add that here on that day, not before.
 *
 * Fonts and colours are the app's own (src/index.css): Manrope for text and
 * JetBrains Mono for figures and labels.
 */
const PRICE = { symbol: '₹', amount: '1,200', period: 'month' };

/** The strip of four facts under the hero photo. Each one is a feature that is live. */
const HERO_FACTS = [
  { label: 'Real margin', value: 'Per-dish', note: 'Calculated down to grams' },
  { label: 'Invoicing', value: 'UPI + QR', note: 'Zero payment chasing' },
  { label: 'Order intake', value: 'Auto-fill', note: 'Direct from WhatsApp text' },
  { label: 'Cost drift', value: 'Live Alerts', note: 'When butter or flour rises' },
];

/** Page gutter and max width. */
const WRAP = 'w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8';
const SECTION = 'py-16 sm:py-20 lg:py-24';
const BAND = 'bg-[#EAF4F3] border-y border-[#D0E4E2]';

const MONO = 'font-mono';
const EYEBROW = `${MONO} text-[11px] sm:text-xs font-semibold uppercase tracking-[0.08em] text-primary`;

const CARD = 'bg-white rounded-[20px] border border-[#D0E4E2] shadow-[0_2px_6px_rgba(43,49,61,0.04)]';
const CARD_HOVER = 'transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-light hover:shadow-[0_8px_20px_rgba(0,121,123,0.08)]';
const BTN_PRIMARY = 'whitespace-nowrap inline-flex items-center justify-center gap-2 h-12 px-7 rounded-xl bg-primary hover:bg-primary-dark text-white font-semibold shadow-md shadow-primary/20 transition-all hover:-translate-y-0.5 active:scale-[0.98]';
const BTN_SECONDARY = 'whitespace-nowrap inline-flex items-center justify-center gap-2 h-12 px-7 rounded-xl bg-white hover:bg-[#EAF4F3] text-ink font-semibold border border-[#D0E4E2] transition-colors';

const FAQS: { q: string; a: string }[] = [
  { q: 'Do I need a GST number?', a: 'No. GST is optional and only switches on if you turn it on in Settings.' },
  { q: 'Do I need WhatsApp Business?', a: 'No. Bills, menus and reminders open in your usual WhatsApp with the message ready; you press send.' },
  { q: 'Can customers order ahead?', a: 'Yes. Book a pre-order for any date, take an advance, and the bill asks only for the balance. The sale counts on the day you hand it over.' },
  {
    q: 'What does the AI see?',
    a: "Your business figures, so it can answer questions about them. Your customers' phone numbers are never sent, and nothing is saved from a pasted message until you check it and press save.",
  },
  { q: 'Does the AI cost extra?', a: "No. It's included in your plan, with fair daily limits." },
  { q: 'Does it work on my phone?', a: "Yes, in your phone's browser. Nothing to install." },
  { q: 'Do I need an accounting background?', a: 'No. If you know what you paid for your ingredients, Stockpot does the rest.' },
  { q: 'Is my data safe?', a: "Your data is stored in Google's Firebase cloud, encrypted in transit and at rest, and each account can only see its own data." },
  { q: 'Can I cancel anytime?', a: 'Yes, from Settings → User Account → Manage Billing. No lock-in.' },
  {
    q: 'Can I try it before I pay?',
    a: `Yes. The ${TRIAL_DAYS}-day trial is free: a card is required to start, and you won't be charged if you cancel before it ends. You can also explore the demo kitchen from the sign-in screen without signing up.`,
  },
];

const PROBLEMS = [
  {
    icon: TrendingUp, accent: 'border-t-coral', chip: 'bg-coral/10 text-coral',
    title: 'Prices go up quietly',
    body: "Butter, cream and boxes cost a little more each month. Your menu prices don't move, and the margin slips without anyone noticing.",
    left: 'Unsalted Butter, demo kitchen', right: '+30%', rightTone: 'bg-coral/10 text-coral',
  },
  {
    icon: MessageCircle, accent: 'border-t-primary', chip: 'bg-primary/10 text-primary',
    title: 'Money gets lost between chats, cash and UPI',
    body: "Orders arrive on WhatsApp, advances by UPI, balances in cash. By month-end, nobody's sure who still owes what.",
    left: 'Pending balances', right: 'Untracked advances', rightTone: 'bg-[#EAF4F3] text-ink',
  },
  {
    icon: Receipt, accent: 'border-t-ink', chip: 'bg-ink/10 text-ink',
    title: "Sales aren't profit",
    body: 'Delivery, discounts, card fees, a spoiled batch and the rent all come out of the same money. Most tools stop counting at sales.',
    left: 'Gross revenue', right: '≠ cash in hand', rightTone: 'bg-coral/10 text-coral',
  },
];

const STEPS = [
  { title: 'Add your ingredients', body: 'What you have and what you paid, in grams, kilos or pieces.', chip: 'g · kg · ml · l · pcs' },
  { title: 'Build your recipes', body: 'Each one is costed for you, with a suggested price.', chip: 'Suggested price' },
  { title: 'Take orders and log bakes', body: 'Paste orders from WhatsApp, book ahead, bill with a UPI QR.', chip: 'WhatsApp + UPI' },
  { title: 'Read your morning briefing', body: 'True profit, and what to fix today.', chip: 'True profit' },
];

const PLAN_FEATURES = [
  'Unlimited recipes, orders, pre-orders and production runs',
  'Bills with UPI QR, statements and menu PDFs over WhatsApp',
  'True profit, margin alerts and price suggestions',
  'Morning briefing and Ask Your Business, with fair daily limits',
  'GST for India, reorder suggestions, wastage and R&D tracking',
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

const Bullets: React.FC<{ items: string[]; tone?: string }> = ({ items, tone = 'text-primary' }) => (
  <ul className="space-y-2.5 text-sm text-ink">
    {items.map(item => (
      <li key={item} className="flex items-start gap-2.5">
        <CircleCheck size={18} className={`${tone} shrink-0 mt-0.5`} />
        <span>{item}</span>
      </li>
    ))}
  </ul>
);

/** A step tag in the style of the app's column headers: "Step 01". */
const StepTag: React.FC<{ n: string; tone?: string }> = ({ n, tone = 'bg-[#EAF4F3] text-primary' }) => (
  <span className={`${MONO} inline-block px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-[0.08em] mb-3 ${tone}`}>{n}</span>
);

/** A phone shown in the dark device frame the page draws in CSS: no frame images are needed. */
const Phone: React.FC<{ src: string; alt: string; className?: string }> = ({ src, alt, className = '' }) => (
  <div className={`rounded-[2rem] border-[7px] border-ink bg-ink shadow-[0_24px_48px_-12px_rgba(43,49,61,0.4)] overflow-hidden ${className}`}>
    <img src={src} alt={alt} width={780} height={1688} loading="lazy" decoding="async" className="w-full h-auto block rounded-[1.5rem]" />
  </div>
);

const LandingPage: React.FC = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Smooth-scroll the in-page anchors while the page is open.
  useEffect(() => {
    const previous = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => { document.documentElement.style.scrollBehavior = previous; };
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFB] text-ink font-sans antialiased selection:bg-primary-light/40 overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#F8FAFB]/95 backdrop-blur-md border-b border-[#D0E4E2]/60">
        <div className={`${WRAP} h-16 sm:h-20 flex items-center justify-between gap-4`}>
          <a href="#top" className="flex items-center gap-2.5 sm:gap-3 group" aria-label="Stockpot home">
            <img src="/logo-icon.png" alt="" className="w-9 h-9 object-contain group-hover:scale-105 transition-transform" />
            <span className="flex flex-col">
              <span className="font-extrabold text-lg sm:text-xl tracking-tight text-primary leading-none uppercase">Stockpot</span>
              <span className={`${MONO} hidden sm:block text-[9px] uppercase tracking-wider text-muted mt-1 font-semibold`}>Kitchen Intelligence</span>
            </span>
          </a>
          <nav aria-label="Sections" className="hidden md:flex items-center gap-8 text-[15px] font-medium text-ink">
            <a href="#features" className="hover:text-primary transition-colors">Features</a>
            <a href="#how" className="hover:text-primary transition-colors">How it works</a>
            <a href="#pricing" className="hover:text-primary transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-primary transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-1 sm:gap-4">
            <Link to="/app" className="whitespace-nowrap text-sm font-semibold text-ink hover:text-primary transition-colors px-2 sm:px-3 py-2">
              <span className="sm:hidden">Log In</span>
              <span className="hidden sm:inline">Sign In / Demo</span>
            </Link>
            <Link to="/app" className="whitespace-nowrap inline-flex items-center justify-center h-10 px-4 sm:px-5 rounded-xl bg-primary hover:bg-primary-dark text-white text-sm font-semibold shadow-sm transition-all hover:shadow active:scale-95">
              <span className="hidden sm:inline">Start Free Trial</span>
              <span className="sm:hidden">Start Free</span>
            </Link>
          </div>
        </div>
      </header>

      <main id="top">
        {/* 1. Hero: the promise, then a bakery counter with the tablet that runs it */}
        <section className="pt-10 sm:pt-12 pb-14 sm:pb-16">
          <div className={`${WRAP} flex flex-col items-center text-center`}>
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-[#EAF4F3] border border-[#D0E4E2] mb-6"
            >
              <span className="w-2 h-2 rounded-full bg-margin animate-pulse shrink-0" aria-hidden="true" />
              <span className={`${MONO} text-[10px] sm:text-xs font-bold uppercase tracking-wider text-primary`}>
                For home bakers, chefs, tiffin services &amp; cloud kitchens
              </span>
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.06 }}
              className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-[-0.03em] leading-[1.1] max-w-4xl mb-6"
            >
              Know exactly what your food business makes.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.12 }}
              className="text-lg md:text-xl text-muted max-w-2xl leading-relaxed mb-8"
            >
              Stockpot tracks your ingredients, orders, and fluctuating costs. It calculates what every single order actually earns you — after packaging, delivery, discounts, payment fees, and GST.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.18 }}
              className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 w-full sm:w-auto"
            >
              <Link to="/app" className={`${BTN_PRIMARY} w-full sm:w-auto`}>
                Start your {TRIAL_DAYS}-day free trial
              </Link>
              <a href="#how" className={`${BTN_SECONDARY} w-full sm:w-auto`}>
                Explore Kitchen Tour <ArrowRight size={16} />
              </a>
            </motion.div>
            <p className={`${MONO} mt-4 mb-10 sm:mb-12 flex flex-col sm:flex-row items-center justify-center gap-x-2 gap-y-1 text-xs md:text-sm text-muted`}>
              <span><span className="font-semibold text-ink">{PRICE.symbol}{PRICE.amount}</span> /{PRICE.period} after trial</span>
              <span className="hidden sm:inline text-[#D0E4E2]" aria-hidden="true">•</span>
              <span className="inline-flex items-center gap-2">
                Card required to start
                <span className="text-[#D0E4E2]" aria-hidden="true">•</span>
                Cancel anytime
              </span>
            </p>

            {/* The bakery counter, with the tablet that runs the kitchen */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.25 }}
              className="relative w-full max-w-5xl rounded-3xl overflow-hidden border border-[#D0E4E2]/70 shadow-2xl bg-[#E9DFD0]"
            >
              <img
                src="/landing/hero-kitchen.webp"
                alt="An artisan bakery counter with fresh sourdough, a layered cake, cookies on a rack and the Stockpot dashboard open on a tablet"
                width={1376}
                height={768}
                decoding="async"
                fetchPriority="high"
                className="w-full h-auto block aspect-[4/3] sm:aspect-[16/9] object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent pointer-events-none" aria-hidden="true" />
              <div className="absolute top-3 left-3 sm:top-6 sm:left-6 flex items-center gap-3 sm:gap-3.5 max-w-[calc(100%-1.5rem)] bg-white/95 backdrop-blur-md p-3 sm:p-4 rounded-2xl shadow-lg border border-[#D0E4E2]/80 text-left">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#EAF4F3] border border-[#D0E4E2]/60 text-margin flex items-center justify-center shrink-0">
                  <IndianRupee size={20} strokeWidth={2.5} aria-hidden="true" />
                </div>
                <div>
                  <p className={`${MONO} text-[10px] sm:text-[11px] font-semibold text-muted uppercase tracking-wider`}>Butter Croissant × 8 · demo kitchen</p>
                  <p className="text-sm sm:text-[15px] font-extrabold text-ink mt-0.5">
                    Made <span className={`${MONO} text-margin text-base tracking-tight`}>₹743.04</span> <span className="text-muted font-normal text-xs">on this order</span>
                  </p>
                </div>
              </div>
              <div className={`${MONO} absolute bottom-3 right-3 sm:bottom-6 sm:right-6 inline-flex items-center gap-2 bg-black/60 backdrop-blur-md text-white/90 text-[11px] sm:text-xs px-3 sm:px-3.5 py-1.5 rounded-full border border-white/10`}>
                <span className="w-1.5 h-1.5 rounded-full bg-margin" aria-hidden="true" />
                Stockpot Demo Kitchen
              </div>
            </motion.div>

            {/* Four quick facts */}
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 max-w-4xl w-full mt-12 sm:mt-14 pt-8 border-t border-[#D0E4E2]/60">
              {HERO_FACTS.map(f => (
                <div key={f.label} className="flex flex-col items-center text-center">
                  <dt className={`${MONO} text-[11px] font-bold uppercase tracking-wider text-muted mb-1`}>{f.label}</dt>
                  <dd className="m-0 flex flex-col items-center">
                    <span className={`${MONO} text-lg sm:text-2xl font-extrabold text-primary`}>{f.value}</span>
                    <span className="text-xs text-muted mt-0.5">{f.note}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* 2. Problem */}
        <section className={`${BAND} ${SECTION}`}>
          <div className={WRAP}>
            <Reveal className="max-w-2xl mx-auto text-center mb-12 sm:mb-14">
              <span className={`${EYEBROW} block mb-2`}>The profit leak audit</span>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.02em]">
                Busy every day. Still not sure what you made?
              </h2>
            </Reveal>
            <div className="grid md:grid-cols-3 gap-5 lg:gap-6">
              {PROBLEMS.map(({ icon: Icon, accent, chip, title, body, left, right, rightTone }, i) => (
                <Reveal key={title} delay={i * 0.08} className={`${CARD} ${CARD_HOVER} border-t-4 ${accent} p-6 lg:p-7 flex flex-col justify-between`}>
                  <div>
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-5 ${chip}`}>
                      <Icon size={22} />
                    </div>
                    <h3 className="text-lg lg:text-xl font-bold mb-2">{title}</h3>
                    <p className="text-muted leading-relaxed">{body}</p>
                  </div>
                  <div className="mt-6 pt-3.5 border-t border-[#D0E4E2] flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted">{left}</span>
                    <span className={`${MONO} font-semibold px-2 py-0.5 rounded ${rightTone}`}>{right}</span>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* 3. Features */}
        <section id="features" className={`scroll-mt-20 ${SECTION}`}>
          <div className={`${WRAP} flex flex-col gap-16 sm:gap-20 lg:gap-24`}>
            <Reveal className="max-w-3xl">
              <span className={`${EYEBROW} block mb-2`}>What&apos;s inside</span>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.02em] mb-4">Everything between the order and the profit</h2>
              <p className="text-lg text-muted leading-relaxed">
                Built around how a home food business actually runs: WhatsApp orders, UPI payments, made-to-order cakes and prices that change every month.
              </p>
            </Reveal>

            {/* Row 1: take orders, get paid, beside two phones */}
            <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
              <div className="lg:col-span-6 flex flex-col gap-9">
                <Reveal>
                  <StepTag n="01" />
                  <h3 className="text-2xl font-bold tracking-tight mb-3">Take orders the way customers send them</h3>
                  <p className="text-muted leading-relaxed mb-4">
                    Paste a customer&apos;s WhatsApp message and Stockpot fills in the order for you: items, quantities, date, address and any advance. You check it and save. Booking ahead for a birthday cake? Make it a pre-order — no baked stock needed until the day.
                  </p>
                  <Bullets items={[
                    'Past customers suggested as you type a name or number',
                    'Pre-orders with a time slot, notes and an advance',
                    '"Due today" and "Due tomorrow" waiting on your dashboard',
                    'Shopify and Odoo orders imported too',
                  ]} />
                </Reveal>
                <Reveal className="pt-8 border-t border-[#D0E4E2]">
                  <StepTag n="02" tone="bg-margin/15 text-[#0E7A57]" />
                  <h3 className="text-2xl font-bold tracking-tight mb-3">Get paid without chasing</h3>
                  <p className="text-muted leading-relaxed mb-4">
                    Send a clean bill on WhatsApp in a tap, with a UPI QR for exactly what&apos;s due — the balance, if they&apos;ve paid an advance. Customers who pay later get one statement for everything they owe.
                  </p>
                  <Bullets tone="text-margin" items={[
                    'Itemised bill with discount and GST',
                    'UPI QR and a view-online link on every bill',
                    'Pending payments, customer by customer',
                    'Your menu as a branded PDF, ready to share',
                  ]} />
                </Reveal>
              </div>
              <Reveal className="lg:col-span-6 flex justify-center">
                <div className="flex items-start w-full max-w-md sm:max-w-lg">
                  <Phone
                    src="/landing/phone-order.webp"
                    alt="Stockpot's Add Order form on a phone, filled in from a pasted WhatsApp message: 12 butter croissants and 6 chocolate muffins, set as a pre-order"
                    className="w-1/2"
                  />
                  <Phone
                    src="/landing/phone-bill.webp"
                    alt="The bill for that order on a phone: items, an advance received, the balance due and a UPI QR code for the balance"
                    className="w-1/2 -ml-[8%] mt-10 sm:mt-14 relative z-10"
                  />
                </div>
              </Reveal>
            </div>

            {/* A food photo between the rows */}
            <Reveal className="relative h-60 sm:h-72 lg:h-80 rounded-3xl overflow-hidden border border-[#D0E4E2] shadow-lg">
              <img src="/landing/pastries.webp" alt="" aria-hidden="true" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-ink/85 via-ink/45 to-transparent flex items-center px-6 sm:px-12">
                <div className="max-w-xl">
                  <span className={`${MONO} text-xs font-semibold uppercase tracking-[0.08em] text-primary-light block mb-2`}>Every bake</span>
                  <p className="text-white text-2xl sm:text-3xl font-extrabold leading-snug">Costed from what you actually paid.</p>
                  <p className="text-sm text-white/80 mt-2">
                    Prices and costs are locked in when the order is taken, so a price change never rewrites last month.
                  </p>
                </div>
              </div>
            </Reveal>

            {/* Row 2: what an order made, when a price needs to go up, beside the laptop */}
            <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
              <Reveal className="lg:col-span-7 order-2 lg:order-1">
                <div className="rounded-t-2xl border-[10px] border-b-0 border-ink bg-ink shadow-[0_24px_48px_-12px_rgba(43,49,61,0.35)]">
                  <img
                    src="/landing/laptop-pricing.webp"
                    alt="Stockpot's Menu on a laptop with Needs repricing on: Butter Croissant's margin has slipped from 62% to 53% because Unsalted Butter is up 30%, with a button to use a price that brings the margin back"
                    width={1440}
                    height={900}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-auto block rounded-t-md"
                  />
                </div>
                <div className="h-3 sm:h-4 mx-[-2%] rounded-b-2xl bg-gradient-to-b from-slate-300 to-slate-400 shadow-md" aria-hidden="true">
                  <div className="mx-auto w-24 h-1 rounded-b bg-slate-500/60" />
                </div>
              </Reveal>
              <div className="lg:col-span-5 flex flex-col gap-9 order-1 lg:order-2">
                <Reveal>
                  <StepTag n="03" />
                  <h3 className="text-2xl font-bold tracking-tight mb-3">Know what every order made</h3>
                  <p className="text-muted leading-relaxed mb-4">
                    Every order shows what you made on it after ingredients, packaging, delivery, discounts, payment fees and GST. Your dashboard then takes off wastage and your rent, gas and salaries, so the profit you see is the profit you keep.
                  </p>
                  <Bullets items={[
                    'Prices and costs locked in when the order is taken — a price change never rewrites last month',
                    'Profit for each product, not just the total',
                    'GST-inclusive or exclusive pricing, handled either way',
                    'Fixed costs spread across any day, week or month',
                  ]} />
                </Reveal>
                <Reveal className="pt-8 border-t border-[#D0E4E2]">
                  <StepTag n="04" tone="bg-coral/10 text-coral" />
                  <h3 className="text-2xl font-bold tracking-tight mb-3">Know when a price needs to go up</h3>
                  <p className="text-muted leading-relaxed mb-4">
                    Stockpot remembers what each item cost when you priced it. When an ingredient gets dearer, it tells you which items slipped and why — &ldquo;Butter +30%&rdquo; — and suggests a price that gets your margin back.
                  </p>
                  <Bullets items={[
                    'Suggested prices for the margin you want, GST included',
                    '"What if I raise prices 8%?" answered before you change anything',
                    'Price history for every ingredient',
                  ]} />
                </Reveal>
              </div>
            </div>

            {/* Briefing and stock, as cards */}
            <div className="grid md:grid-cols-2 gap-5 lg:gap-6">
              <Reveal className={`${CARD} ${CARD_HOVER} p-7 flex flex-col`}>
                <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-5"><Sun size={22} /></div>
                <h3 className="text-xl font-bold mb-3">A business briefing every morning</h3>
                <p className="text-muted leading-relaxed mb-6">
                  Open Stockpot to yesterday&apos;s sales and true profit, why they moved, and what needs your attention today. Ask in plain words — &ldquo;What should I stop selling?&rdquo; — and get answers from your own numbers.
                </p>
                <ul className="mt-auto space-y-2 text-sm pt-4 border-t border-[#D0E4E2]">
                  {[
                    'Repricing, price rises, low stock and customers due, flagged for you',
                    'Stockpot does the maths; the AI explains it',
                    "Your customers' phone numbers are never sent to the AI",
                  ].map(t => (
                    <li key={t} className="flex items-start gap-2.5"><span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-2" />{t}</li>
                  ))}
                </ul>
              </Reveal>
              <Reveal delay={0.08} className={`${CARD} ${CARD_HOVER} p-7 flex flex-col`}>
                <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-5"><Boxes size={22} /></div>
                <h3 className="text-xl font-bold mb-3">Stock that keeps itself up to date</h3>
                <p className="text-muted leading-relaxed mb-6">
                  Restock in grams or kilos. Log a bake and the ingredients come off by themselves. Stockpot warns you before something runs out and tells you how much to order.
                </p>
                <ul className="mt-auto space-y-2 text-sm pt-4 border-t border-[#D0E4E2]">
                  {[
                    'Reorder suggestions from your last four weeks',
                    'Batches with expiry dates, and what\'s left after orders',
                    'Wastage and recipe trials tracked separately',
                    'Nutrition and allergens per serving',
                  ].map(t => (
                    <li key={t} className="flex items-start gap-2.5"><span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-2" />{t}</li>
                  ))}
                </ul>
              </Reveal>
            </div>

            {/* Two small tiles */}
            <div className="grid sm:grid-cols-2 gap-5 lg:gap-6 -mt-6 lg:-mt-8">
              <Reveal className={`${CARD} p-5 flex items-start gap-4`}>
                <div className="w-10 h-10 rounded-xl bg-[#EAF4F3] text-primary flex items-center justify-center shrink-0"><Send size={18} /></div>
                <div>
                  <h4 className="font-bold mb-1">Customers worth a message</h4>
                  <p className="text-sm text-muted leading-relaxed">See who&apos;s due for their usual order and who&apos;s gone quiet, then nudge them on WhatsApp with their favourite item.</p>
                </div>
              </Reveal>
              <Reveal delay={0.08} className={`${CARD} p-5 flex items-start gap-4`}>
                <div className="w-10 h-10 rounded-xl bg-[#EAF4F3] text-primary flex items-center justify-center shrink-0"><IndianRupee size={18} /></div>
                <div>
                  <h4 className="font-bold mb-1">Built for India</h4>
                  <p className="text-sm text-muted leading-relaxed">Rupees, GST, UPI, and ingredient names like maida, besan and ragi. Weigh in grams, kilos, millilitres, litres or pieces.</p>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* 4. How it works */}
        <section id="how" className={`scroll-mt-20 ${BAND} ${SECTION}`}>
          <div className={WRAP}>
            <Reveal className="text-center max-w-2xl mx-auto mb-12">
              <span className={`${EYEBROW} block mb-2`}>Simple workflow</span>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.02em]">From ingredients to true profit in four steps</h2>
            </Reveal>
            <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-6">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex">
                  <Reveal delay={i * 0.07} className={`${CARD} p-6 flex flex-col w-full`}>
                    <div className={`${MONO} w-11 h-11 rounded-xl bg-primary text-white flex items-center justify-center font-bold text-lg shadow-sm mb-4`}>
                      {String(i + 1).padStart(2, '0')}
                    </div>
                    <h3 className="text-lg font-bold mb-1.5">{step.title}</h3>
                    <p className="text-sm text-muted leading-relaxed mb-5">{step.body}</p>
                    <span className={`${MONO} mt-auto self-start px-3 py-1.5 rounded-lg bg-[#EAF4F3] border border-[#D0E4E2] text-xs font-semibold text-ink`}>
                      {step.chip}
                    </span>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 5. Pricing */}
        <section id="pricing" className={`scroll-mt-20 ${SECTION}`}>
          <div className={WRAP}>
            <Reveal className="text-center max-w-2xl mx-auto mb-10">
              <span className={`${EYEBROW} block mb-2`}>Honest and simple</span>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.02em] mb-3">One plan. Everything included.</h2>
              <p className="text-lg text-muted">Try it free for {TRIAL_DAYS} days.</p>
            </Reveal>
            <Reveal className={`${CARD} max-w-2xl mx-auto border-2 border-primary p-6 sm:p-9 shadow-[0_24px_48px_-12px_rgba(0,121,123,0.16)]`}>
              <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                  <h3 className="text-2xl font-bold">Stockpot Pro</h3>
                  <p className="text-sm text-muted mt-0.5">All features, unlimited access</p>
                </div>
                <span className={`${MONO} px-3 py-1 rounded-full bg-[#EAF4F3] border border-[#D0E4E2] text-primary text-[11px] font-semibold uppercase tracking-[0.08em] whitespace-nowrap`}>{TRIAL_DAYS}-day free trial</span>
              </div>
              <div className="mb-6 pb-6 border-b border-[#D0E4E2] flex items-baseline gap-1.5">
                <span className={`${MONO} text-5xl font-bold tracking-tight tabular-nums`}>{PRICE.symbol}{PRICE.amount}</span>
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
              <Link to="/app" className={`${BTN_PRIMARY} w-full`}>Start your free trial</Link>
              <p className="text-center text-xs text-muted mt-3">Card required to start. You won&apos;t be charged if you cancel before the trial ends.</p>
            </Reveal>
          </div>
        </section>

        {/* 6. FAQ */}
        <section id="faq" className={`scroll-mt-20 ${BAND} ${SECTION}`}>
          <div className={WRAP}>
            <Reveal className="text-center max-w-2xl mx-auto mb-10">
              <span className={`${EYEBROW} block mb-2`}>Transparency first</span>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.02em]">Questions, answered</h2>
            </Reveal>
            <div className="max-w-3xl mx-auto space-y-3">
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

        {/* 7. Final call to action, over a bakery photo */}
        <section className={SECTION}>
          <div className={WRAP}>
            <Reveal className="relative rounded-3xl text-white text-center px-6 py-16 sm:py-20 overflow-hidden shadow-xl bg-ink">
              <img src="/landing/sourdough.webp" alt="" aria-hidden="true" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-ink/75" />
              <div className="relative">
                <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.02em] mb-3">Know exactly what you made this week.</h2>
                <p className="text-lg text-white/90 mb-8 max-w-xl mx-auto">
                  Start your {TRIAL_DAYS}-day free trial and see your true profit by tomorrow morning.
                </p>
                <Link to="/app" className="inline-flex items-center justify-center gap-2 h-12 px-8 rounded-xl bg-white text-primary font-bold hover:bg-[#EAF4F3] transition-colors shadow-md">
                  Start your free trial <ArrowRight size={18} />
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* 8. Footer */}
      <footer className="bg-white border-t border-[#D0E4E2] pt-12 pb-8">
        <div className={`${WRAP} flex flex-col md:flex-row md:items-start md:justify-between gap-8`}>
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <img src="/logo-icon.png" alt="" className="w-8 h-8" />
              <span className="text-xl font-extrabold tracking-tight">Stockpot</span>
            </div>
            <p className="text-muted max-w-xs text-sm">True profit for home food businesses.</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-3 text-sm font-medium">
            <a href="#features" className="text-muted hover:text-primary transition-colors">Features</a>
            <a href="#pricing" className="text-muted hover:text-primary transition-colors">Pricing</a>
            <a href="#faq" className="text-muted hover:text-primary transition-colors">FAQ</a>
            <Link to="/app" className="text-muted hover:text-primary transition-colors">Log in</Link>
            <Link to="/terms" className="text-muted hover:text-primary transition-colors">Terms of Service</Link>
            <Link to="/privacy" className="text-muted hover:text-primary transition-colors">Privacy Policy</Link>
          </nav>
        </div>
        <div className={`${WRAP} mt-10`}>
          <div className="pt-6 border-t border-[#D0E4E2] text-sm text-muted">
            &copy; {new Date().getFullYear()} Stockpot. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
