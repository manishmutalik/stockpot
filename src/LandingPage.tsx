import React, { useEffect, useRef, useState } from 'react';
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
 *
 * The layout follows the Stitch landing page redesign (warm bands between white
 * sections, a tilting hero photo and pricing card, boxed feature steps beside
 * the screenshots, a two-column FAQ, a full-width dark call to action and a
 * dark footer). Only the layout and look come from the redesign: every word on
 * the page is the page's own, because the redesign's copy made claims the
 * product does not back up (see LandingPage.test.tsx). Its motion (scroll
 * reveal, a little parallax, a tilt on two cards) is switched off for visitors
 * who ask for reduced motion.
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
/** The warm and cool tinted bands between the white sections. */
const BAND_WARM = 'bg-[#f6f2ec] border-y border-[#ebdcc8]';
const BAND_COOL = 'bg-[#f4f7f6] border-y border-[#deece9]';

const MONO = 'font-mono';
const EYEBROW = `${MONO} text-[11px] sm:text-xs font-semibold uppercase tracking-[0.08em] text-primary`;

const CARD = 'bg-white rounded-2xl border border-[#D0E4E2]/70 shadow-[0_2px_6px_rgba(43,49,61,0.04)]';
const CARD_LIFT = `${CARD} landing-lift`;
const BTN_PRIMARY = 'landing-shimmer whitespace-nowrap inline-flex items-center justify-center gap-2 h-12 px-7 rounded-xl bg-primary hover:bg-primary-dark text-white font-semibold shadow-md shadow-primary/20 transition-colors active:scale-[0.98]';
const BTN_SECONDARY = 'whitespace-nowrap inline-flex items-center justify-center gap-2 h-12 px-7 rounded-xl bg-white hover:bg-[#f1ebe1] text-ink font-semibold border border-[#D0E4E2] shadow-sm transition-all hover:-translate-y-0.5 active:translate-y-0';

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

/** True when the visitor asked for less motion. A browser that cannot say gets the motion. */
const wantsLessMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Runs `update` on the next frame after each scroll, once now, and cleans up after itself. */
function onScrollFrames(update: () => void): () => void {
  let frame = 0;
  const tick = () => { frame = 0; update(); };
  const onScroll = () => { if (!frame) frame = requestAnimationFrame(tick); };
  update();
  window.addEventListener('scroll', onScroll, { passive: true });
  return () => { window.removeEventListener('scroll', onScroll); if (frame) cancelAnimationFrame(frame); };
}

/** Drifts an element a fraction of the way the page has scrolled (a soft parallax). */
function useDrift<T extends HTMLElement>(speed: number) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || wantsLessMotion()) return;
    return onScrollFrames(() => { el.style.transform = `translate3d(0, ${(window.scrollY * speed).toFixed(1)}px, 0)`; });
  }, [speed]);
  return ref;
}

/**
 * A photo that slides a little inside its frame as the frame crosses the screen. The photo is drawn taller than the frame
 * (see the classes where it is used) so no edge ever shows.
 */
function useBandParallax<C extends HTMLElement, I extends HTMLElement>(strength: number) {
  const frame = useRef<C>(null);
  const image = useRef<I>(null);
  useEffect(() => {
    const box = frame.current;
    const img = image.current;
    if (!box || !img || wantsLessMotion()) return;
    return onScrollFrames(() => {
      const rect = box.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      const y = ((rect.top + rect.height / 2 - window.innerHeight / 2) / window.innerHeight) * strength;
      img.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0) scale(1.06)`;
    });
  }, [strength]);
  return { frame, image };
}

/** Tilts what is inside it a few degrees toward the mouse. Only for a mouse (not touch) and not for reduced motion. */
const Tilt: React.FC<{ children: React.ReactNode; className?: string; max?: number }> = ({ children, className = '', max = 5 }) => {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const live = useRef(false);
  useEffect(() => {
    live.current = !wantsLessMotion() && typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover)').matches;
    return () => cancelAnimationFrame(frame.current);
  }, []);
  const move = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!live.current || !el) return;
    const { clientX, clientY } = e;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const rx = (((clientY - r.top - r.height / 2) / (r.height / 2)) * -max).toFixed(2);
      const ry = (((clientX - r.left - r.width / 2) / (r.width / 2)) * max).toFixed(2);
      el.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.015, 1.015, 1.015)`;
    });
  };
  const leave = () => { cancelAnimationFrame(frame.current); if (ref.current) ref.current.style.transform = ''; };
  return <div ref={ref} onMouseMove={move} onMouseLeave={leave} className={`landing-tilt ${className}`}>{children}</div>;
};

/** A white card with a step tag, a heading, its words and a tick list: one feature, boxed. */
const StepCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`${CARD_LIFT} p-6 sm:p-7 ${className}`}>{children}</div>
);

const LandingPage: React.FC = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [scrolled, setScrolled] = useState(false);
  const glowA = useDrift<HTMLDivElement>(0.18);
  const glowB = useDrift<HTMLDivElement>(-0.12);
  const panorama = useBandParallax<HTMLDivElement, HTMLImageElement>(36);
  const closing = useBandParallax<HTMLElement, HTMLImageElement>(48);

  // Smooth-scroll the in-page anchors while the page is open.
  useEffect(() => {
    const previous = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => { document.documentElement.style.scrollBehavior = previous; };
  }, []);

  // The header gets a shadow once the page has moved under it.
  useEffect(() => onScrollFrames(() => setScrolled(window.scrollY > 30)), []);

  return (
    <div className="min-h-screen bg-[#F8FAFB] text-ink font-sans antialiased selection:bg-primary-light/40 overflow-x-hidden">
      {/* Header */}
      <header className={`sticky top-0 z-50 backdrop-blur-md border-b border-[#D0E4E2]/50 transition-all duration-300 ${scrolled ? 'bg-[#F8FAFB]/95 shadow-md' : 'bg-[#F8FAFB]/90 shadow-[0_1px_12px_rgba(22,28,39,0.03)]'}`}>
        <div className={`${WRAP} h-16 sm:h-20 flex items-center justify-between gap-4`}>
          <a href="#top" className="flex items-center gap-2.5 sm:gap-3 group" aria-label="Stockpot home">
            <img src="/logo-icon.png" alt="" className="w-9 h-9 object-contain group-hover:scale-105 transition-transform duration-300" />
            <span className="flex flex-col">
              <span className="font-extrabold text-lg sm:text-xl tracking-tight text-primary leading-none uppercase">Stockpot</span>
              <span className={`${MONO} hidden sm:block text-[9px] uppercase tracking-wider text-muted mt-1 font-semibold`}>Kitchen Intelligence</span>
            </span>
          </a>
          <nav aria-label="Sections" className="hidden md:flex items-center gap-8 text-[15px] font-semibold text-muted">
            {[['#features', 'Features'], ['#how', 'How it works'], ['#pricing', 'Pricing'], ['#faq', 'FAQ']].map(([href, label]) => (
              <a key={href} href={href} className="inline-block py-1 hover:text-primary hover:-translate-y-0.5 transition-all">{label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-1 sm:gap-3">
            <Link to="/app" className="whitespace-nowrap text-sm font-semibold text-muted hover:text-primary hover:bg-[#EAF4F3] rounded-lg transition-colors px-2 sm:px-3 py-2">
              <span className="sm:hidden">Log In</span>
              <span className="hidden sm:inline">Sign In / Demo</span>
            </Link>
            <Link to="/app" className="landing-shimmer whitespace-nowrap inline-flex items-center justify-center h-10 px-4 sm:px-5 rounded-full bg-primary hover:bg-primary-dark text-white text-sm font-bold shadow-sm hover:shadow-md transition-colors active:scale-95">
              <span className="hidden sm:inline">Start Free Trial</span>
              <span className="sm:hidden">Start Free</span>
            </Link>
          </div>
        </div>
      </header>

      <main id="top">
        {/* 1. Hero: the promise, then a bakery counter with the tablet that runs it */}
        <section className="relative overflow-hidden bg-gradient-to-b from-[#faf6f0] via-[#f7f2ea]/60 to-[#F8FAFB] pt-12 pb-20 lg:pt-16 lg:pb-28">
          {/* Soft ambient glows behind the headline */}
          <div ref={glowA} className="absolute top-0 left-1/2 -translate-x-1/2 w-[720px] max-w-full h-[340px] pointer-events-none -z-10" aria-hidden="true">
            <div className="landing-glow w-full h-full bg-gradient-to-b from-[#f2dfcb]/50 to-transparent blur-3xl" />
          </div>
          <div ref={glowB} className="absolute top-40 right-10 w-96 h-96 rounded-full bg-margin/10 blur-3xl pointer-events-none -z-10 hidden md:block" aria-hidden="true" />

          <div className={`${WRAP} flex flex-col items-center text-center`}>
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-white border border-[#dfd5c6] shadow-sm mb-6"
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
              className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-[-0.03em] leading-[1.1] max-w-4xl text-balance mb-5"
            >
              The CFO of your food business
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-xl sm:text-2xl font-semibold text-primary max-w-4xl text-balance leading-snug mb-4"
            >
              Know exactly how much money your food business makes.
            </motion.p>
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.14 }}
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
            <p className={`${MONO} mt-4 mb-12 sm:mb-16 flex flex-col sm:flex-row items-center justify-center gap-x-2 gap-y-1 text-xs md:text-sm text-muted`}>
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
              className="w-full max-w-5xl"
            >
              <Tilt max={5}>
                <div className="relative rounded-3xl overflow-hidden border border-[#e5dac9] shadow-2xl bg-[#E9DFD0]">
                  <img
                    src="/landing/hero-kitchen.webp"
                    alt="An artisan bakery counter with fresh sourdough, a layered cake, cookies on a rack and the Stockpot dashboard open on a tablet"
                    width={1376}
                    height={768}
                    decoding="async"
                    fetchPriority="high"
                    className="w-full h-auto block aspect-[4/3] sm:aspect-[16/9] object-cover object-center transition-transform duration-700 hover:scale-[1.01]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent pointer-events-none" aria-hidden="true" />
                  <div className="landing-float absolute top-3 left-3 sm:top-6 sm:left-6 flex items-center gap-3 sm:gap-3.5 max-w-[calc(100%-1.5rem)] bg-white/95 backdrop-blur-md p-3 sm:p-4 rounded-2xl shadow-xl border border-[#D0E4E2]/80 text-left">
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
                </div>
              </Tilt>
            </motion.div>

            {/* Four quick facts */}
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 max-w-4xl w-full mt-12 sm:mt-14 pt-8 border-t border-[#dfd5c6]/70">
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
        <section className={`${BAND_WARM} ${SECTION}`}>
          <div className={WRAP}>
            <Reveal className="max-w-2xl mx-auto text-center mb-12 sm:mb-14">
              <span className={`${EYEBROW} block mb-2`}>The profit leak audit</span>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.02em]">
                Busy every day. Still not sure how much money you made?
              </h2>
            </Reveal>
            <div className="grid md:grid-cols-3 gap-5 lg:gap-6">
              {PROBLEMS.map(({ icon: Icon, accent, chip, title, body, left, right, rightTone }, i) => (
                <Reveal key={title} delay={i * 0.08} className={`landing-lift bg-white rounded-2xl shadow-[0_2px_6px_rgba(43,49,61,0.05)] border-t-4 ${accent} p-6 lg:p-7 flex flex-col justify-between`}>
                  <div>
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-5 ${chip}`}>
                      <Icon size={22} />
                    </div>
                    <h3 className="text-lg lg:text-xl font-bold mb-2">{title}</h3>
                    <p className="text-muted leading-relaxed">{body}</p>
                  </div>
                  <div className="mt-6 pt-3.5 border-t border-[#D0E4E2]/70 flex items-center justify-between gap-3 text-xs">
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
              <div className="lg:col-span-6 flex flex-col gap-6 sm:gap-8">
                <Reveal>
                  <StepCard>
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
                  </StepCard>
                </Reveal>
                <Reveal delay={0.08}>
                  <StepCard>
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
                  </StepCard>
                </Reveal>
              </div>
              <Reveal className="lg:col-span-6 flex justify-center">
                <div className="grid grid-cols-2 gap-4 sm:gap-5 w-full max-w-md sm:max-w-lg">
                  <Phone
                    src="/landing/phone-order.webp"
                    alt="Stockpot's Add Order form on a phone, filled in from a pasted WhatsApp message: 12 butter croissants and 6 chocolate muffins, set as a pre-order"
                    className="transition-transform duration-300 hover:-rotate-1"
                  />
                  <Phone
                    src="/landing/phone-bill.webp"
                    alt="The bill for that order on a phone: items, an advance received, the balance due and a UPI QR code for the balance"
                    className="mt-8 sm:mt-12 transition-transform duration-300 hover:rotate-1"
                  />
                </div>
              </Reveal>
            </div>

            {/* A food photo between the rows, drifting a little as it crosses the screen */}
            <Reveal className="relative h-60 sm:h-72 lg:h-80 rounded-3xl overflow-hidden border border-[#dfd5c6] shadow-lg">
              <div ref={panorama.frame} className="absolute inset-0 overflow-hidden">
                <img
                  ref={panorama.image}
                  src="/landing/pastries.webp" alt="" aria-hidden="true" loading="lazy" decoding="async"
                  className="absolute left-0 w-full h-[130%] -top-[15%] object-cover will-change-transform"
                />
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-ink/85 via-ink/45 to-transparent flex items-center px-6 sm:px-12">
                <div className="max-w-xl">
                  <span className={`${MONO} text-xs font-semibold uppercase tracking-[0.08em] text-primary-light block mb-2`}>Every bake</span>
                  <p className="text-white text-2xl sm:text-3xl font-extrabold leading-snug drop-shadow">Costed from what you actually paid.</p>
                  <p className="text-sm text-white/80 mt-2">
                    Prices and costs are locked in when the order is taken, so a price change never rewrites last month.
                  </p>
                </div>
              </div>
            </Reveal>

            {/* Row 2: what an order made, when a price needs to go up, beside the laptop */}
            <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
              <Reveal className="lg:col-span-7 order-2 lg:order-1">
                <div className="landing-lift rounded-2xl bg-ink p-2.5 sm:p-4 shadow-2xl border border-ink">
                  <div className="flex items-center gap-2 mb-2 px-2" aria-hidden="true">
                    <span className="w-2.5 h-2.5 rounded-full bg-coral" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-margin" />
                  </div>
                  <div className="rounded-xl overflow-hidden border border-white/10">
                    <img
                      src="/landing/laptop-pricing.webp"
                      alt="Stockpot's Menu on a laptop with Needs repricing on: Butter Croissant's margin has slipped from 62% to 53% because Unsalted Butter is up 30%, with a button to use a price that brings the margin back"
                      width={1440}
                      height={900}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-auto block"
                    />
                  </div>
                </div>
              </Reveal>
              <Reveal className="lg:col-span-5 order-1 lg:order-2">
                <StepCard className="flex flex-col gap-8">
                  <div>
                    <StepTag n="03" />
                    <h3 className="text-2xl font-bold tracking-tight mb-3">Know how much money every order made</h3>
                    <p className="text-muted leading-relaxed mb-4">
                      Every order shows what you made on it after ingredients, packaging, delivery, discounts, payment fees and GST. Your dashboard then takes off wastage and your rent, gas and salaries, so the profit you see is the profit you keep.
                    </p>
                    <Bullets items={[
                      'Prices and costs locked in when the order is taken — a price change never rewrites last month',
                      'Profit for each product, not just the total',
                      'GST-inclusive or exclusive pricing, handled either way',
                      'Fixed costs spread across any day, week or month',
                    ]} />
                  </div>
                  <div className="pt-8 border-t border-[#D0E4E2]">
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
                  </div>
                </StepCard>
              </Reveal>
            </div>

            {/* Briefing and stock, as cards */}
            <div className="grid md:grid-cols-2 gap-5 lg:gap-6">
              <Reveal className={`${CARD_LIFT} p-7 flex flex-col`}>
                <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-5"><Sun size={22} /></div>
                <h3 className="text-xl font-bold mb-3">A business briefing every morning</h3>
                <p className="text-muted leading-relaxed mb-6">
                  Open Stockpot to yesterday&apos;s sales and true profit, why they moved, and what needs your attention today. Ask in plain words — &ldquo;What should I stop selling?&rdquo; — and get answers from your own numbers.
                </p>
                <ul className="mt-auto space-y-2 text-sm pt-4 border-t border-[#D0E4E2]/70">
                  {[
                    'Repricing, price rises, low stock and customers due, flagged for you',
                    'Stockpot does the maths; the AI explains it',
                    "Your customers' phone numbers are never sent to the AI",
                  ].map(t => (
                    <li key={t} className="flex items-start gap-2.5"><span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-2" />{t}</li>
                  ))}
                </ul>
              </Reveal>
              <Reveal delay={0.08} className={`${CARD_LIFT} p-7 flex flex-col`}>
                <div className="w-11 h-11 rounded-xl bg-margin/15 text-[#0E7A57] flex items-center justify-center mb-5"><Boxes size={22} /></div>
                <h3 className="text-xl font-bold mb-3">Stock that keeps itself up to date</h3>
                <p className="text-muted leading-relaxed mb-6">
                  Restock in grams or kilos. Log a bake and the ingredients come off by themselves. Stockpot warns you before something runs out and tells you how much to order.
                </p>
                <ul className="mt-auto space-y-2 text-sm pt-4 border-t border-[#D0E4E2]/70">
                  {[
                    'Reorder suggestions from your last four weeks',
                    'Batches with expiry dates, and what\'s left after orders',
                    'Wastage and recipe trials tracked separately',
                    'Nutrition and allergens per serving',
                  ].map(t => (
                    <li key={t} className="flex items-start gap-2.5"><span className="w-1.5 h-1.5 rounded-full bg-margin shrink-0 mt-2" />{t}</li>
                  ))}
                </ul>
              </Reveal>
            </div>

            {/* Two small tiles */}
            <div className="grid sm:grid-cols-2 gap-5 lg:gap-6 -mt-4 lg:-mt-8">
              <Reveal className="landing-lift p-5 rounded-2xl bg-[#faf7f2] border border-[#ebdcc8] flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#fae8d4] text-[#8e4b10] flex items-center justify-center shrink-0"><Send size={18} /></div>
                <div>
                  <h4 className="font-bold mb-1">Customers worth a message</h4>
                  <p className="text-sm text-muted leading-relaxed">See who&apos;s due for their usual order and who&apos;s gone quiet, then nudge them on WhatsApp with their favourite item.</p>
                </div>
              </Reveal>
              <Reveal delay={0.08} className="landing-lift p-5 rounded-2xl bg-[#EAF4F3] border border-[#d2ebe7] flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><IndianRupee size={18} /></div>
                <div>
                  <h4 className="font-bold mb-1">Built for India</h4>
                  <p className="text-sm text-muted leading-relaxed">Rupees, GST, UPI, and ingredient names like maida, besan and ragi. Weigh in grams, kilos, millilitres, litres or pieces.</p>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* 4. How it works */}
        <section id="how" className={`scroll-mt-20 ${BAND_COOL} ${SECTION}`}>
          <div className={WRAP}>
            <Reveal className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
              <span className={`${EYEBROW} block mb-2`}>Simple workflow</span>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.02em]">From ingredients to true profit in four steps</h2>
            </Reveal>
            <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-6">
              {STEPS.map((step, i) => {
                const last = i === STEPS.length - 1;
                return (
                  <li key={step.title} className="flex">
                    <Reveal delay={i * 0.07} className={`landing-lift bg-white p-6 rounded-2xl border-2 ${last ? 'border-margin/30 hover:border-margin' : 'border-primary/20 hover:border-primary'} shadow-[0_2px_6px_rgba(43,49,61,0.04)] flex flex-col w-full`}>
                      <span className={`${MONO} text-3xl font-extrabold mb-4 ${last ? 'text-margin' : 'text-primary'}`}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <h3 className="text-lg font-bold mb-1.5">{step.title}</h3>
                      <p className="text-sm text-muted leading-relaxed mb-6">{step.body}</p>
                      <span className={`${MONO} mt-auto self-start px-2.5 py-1 rounded-md text-xs font-semibold ${last ? 'bg-margin/15 text-[#0E7A57]' : 'bg-[#EAF4F3] text-primary'}`}>
                        {step.chip}
                      </span>
                    </Reveal>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* 5. Pricing */}
        <section id="pricing" className={`scroll-mt-20 ${SECTION}`}>
          <div className={WRAP}>
            <Reveal className="text-center max-w-xl mx-auto mb-12 sm:mb-14">
              <span className={`${EYEBROW} block mb-2`}>Honest and simple</span>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.02em] mb-3">One plan. Everything included.</h2>
              <p className="text-lg text-muted">Try it free for {TRIAL_DAYS} days.</p>
            </Reveal>
            <Reveal className="max-w-lg mx-auto">
              <Tilt max={4.5}>
                <div className="relative overflow-hidden bg-white rounded-3xl border border-[#D0E4E2] p-7 sm:p-10 shadow-xl hover:shadow-2xl hover:border-primary/40 transition-all duration-300">
                  <div className="absolute top-0 right-0 w-36 h-36 bg-gradient-to-bl from-primary/10 to-transparent rounded-bl-full pointer-events-none" aria-hidden="true" />
                  <div className="relative flex items-start justify-between gap-3 mb-5">
                    <div>
                      <h3 className="text-2xl font-bold">Stockpot Pro</h3>
                      <p className="text-sm text-muted mt-0.5">All features, unlimited access</p>
                    </div>
                    <span className={`${MONO} px-3 py-1 rounded-full bg-[#EAF4F3] border border-primary/20 text-primary text-[11px] font-bold uppercase tracking-[0.08em] whitespace-nowrap`}>{TRIAL_DAYS}-day free trial</span>
                  </div>
                  <div className="relative mb-6 pb-6 border-b border-[#D0E4E2] flex items-baseline gap-1.5">
                    <span className={`${MONO} text-4xl sm:text-5xl font-extrabold tracking-tight tabular-nums`}>{PRICE.symbol}{PRICE.amount}</span>
                    <span className="text-muted font-medium">/ {PRICE.period}</span>
                  </div>
                  <ul className="relative space-y-3.5 mb-8">
                    {PLAN_FEATURES.map(f => (
                      <li key={f} className="flex items-start gap-3">
                        <CircleCheck size={20} className="text-margin shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Link to="/app" className={`${BTN_PRIMARY} relative w-full`}>Start your free trial</Link>
                  <p className="relative text-center text-xs text-muted mt-3">Card required to start. You won&apos;t be charged if you cancel before the trial ends.</p>
                </div>
              </Tilt>
            </Reveal>
          </div>
        </section>

        {/* 6. FAQ, in two columns */}
        <section id="faq" className={`scroll-mt-20 ${BAND_WARM} ${SECTION}`}>
          <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <Reveal className="text-center max-w-xl mx-auto mb-12 sm:mb-16">
              <span className={`${EYEBROW} block mb-2`}>Transparency first</span>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.02em]">Questions, answered</h2>
            </Reveal>
            <div className="grid md:grid-cols-2 gap-4 sm:gap-6 items-start">
              {[FAQS.slice(0, Math.ceil(FAQS.length / 2)), FAQS.slice(Math.ceil(FAQS.length / 2))].map((column, c) => (
                <div key={c} className="space-y-4">
                  {column.map(({ q, a }) => {
                    const i = FAQS.findIndex(f => f.q === q);
                    const open = openFaq === i;
                    return (
                      <div key={q} className={`${CARD} overflow-hidden transition-shadow duration-200 ${open ? 'shadow-[0_4px_18px_rgba(0,0,0,0.06)]' : ''}`}>
                        <h3>
                          <button
                            type="button"
                            onClick={() => setOpenFaq(open ? null : i)}
                            aria-expanded={open}
                            aria-controls={`faq-panel-${i}`}
                            id={`faq-button-${i}`}
                            className="w-full flex items-center justify-between gap-4 text-left px-5 sm:px-6 py-5 font-bold hover:text-primary transition-colors"
                          >
                            <span>{q}</span>
                            <ChevronDown size={20} className={`shrink-0 text-muted transition-transform duration-300 ${open ? 'rotate-180 text-primary' : ''}`} />
                          </button>
                        </h3>
                        <div id={`faq-panel-${i}`} role="region" aria-labelledby={`faq-button-${i}`} hidden={!open} className="mx-5 sm:mx-6 mb-5 pt-3 border-t border-[#D0E4E2]/70 text-muted leading-relaxed">
                          {a}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 7. Final call to action, full width over a dark bakery photo */}
        <section ref={closing.frame} className="relative overflow-hidden bg-ink py-20 lg:py-28">
          <img
            ref={closing.image}
            src="/landing/sourdough.webp" alt="" aria-hidden="true" loading="lazy" decoding="async"
            className="absolute left-0 w-full h-[130%] -top-[15%] object-cover opacity-40 will-change-transform"
          />
          <div className="absolute inset-0 bg-ink/75" />
          <Reveal className={`${WRAP} relative max-w-4xl text-center text-white flex flex-col items-center`}>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.02em] leading-tight mb-4">Know exactly how much money you made this week.</h2>
            <p className="text-lg text-white/90 mb-8 max-w-xl">
              Start your {TRIAL_DAYS}-day free trial and see your true profit by tomorrow morning.
            </p>
            <Link to="/app" className="landing-shimmer inline-flex items-center justify-center gap-2 h-12 px-8 rounded-xl bg-white text-primary font-bold hover:bg-[#EAF4F3] transition-colors shadow-xl">
              Start your free trial <ArrowRight size={18} />
            </Link>
          </Reveal>
        </section>
      </main>

      {/* 8. Footer */}
      <footer className="bg-[#12161f] text-[#d4daea] border-t border-[#232936]">
        <div className={`${WRAP} py-14 sm:py-16`}>
          <div className="grid md:grid-cols-4 gap-10 pb-10 border-b border-[#232936]">
            <div className="md:col-span-2">
              <div className="flex items-center gap-2.5 mb-3">
                <img src="/logo-icon.png" alt="" className="w-8 h-8 brightness-0 invert opacity-90" />
                <span className="text-xl font-extrabold tracking-tight text-white">Stockpot</span>
              </div>
              <p className="text-sm text-[#bdc9c8] max-w-xs">True profit for home food businesses.</p>
            </div>
            <nav aria-label="Footer" className="md:col-span-2 grid grid-cols-2 gap-10 text-sm font-medium">
              <ul className="space-y-3">
                <li><a href="#features" className="inline-block text-[#bdc9c8] hover:text-primary-light hover:translate-x-1 transition-all">Features</a></li>
                <li><a href="#pricing" className="inline-block text-[#bdc9c8] hover:text-primary-light hover:translate-x-1 transition-all">Pricing</a></li>
                <li><a href="#faq" className="inline-block text-[#bdc9c8] hover:text-primary-light hover:translate-x-1 transition-all">FAQ</a></li>
              </ul>
              <ul className="space-y-3">
                <li><Link to="/app" className="inline-block text-[#bdc9c8] hover:text-primary-light hover:translate-x-1 transition-all">Log in</Link></li>
                <li><Link to="/terms" className="inline-block text-[#bdc9c8] hover:text-primary-light hover:translate-x-1 transition-all">Terms of Service</Link></li>
                <li><Link to="/privacy" className="inline-block text-[#bdc9c8] hover:text-primary-light hover:translate-x-1 transition-all">Privacy Policy</Link></li>
              </ul>
            </nav>
          </div>
          <div className="pt-6 text-sm text-[#8d9aa0]">
            &copy; {new Date().getFullYear()} Stockpot. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
