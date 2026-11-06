import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Box, Camera, Check, MessageCircle, Minus, Plus, Sun, TrendingUp, Wallet } from 'lucide-react';
import { TRIAL_DAYS } from './utils/trial';
import { WaitlistForm } from './components/landing/WaitlistForm';
import { FOUNDING_CUSTOMERS } from './utils/waitlist';
import { Reveal, onScrollFrames } from './components/landing/motion';

/**
 * The public landing page. Every screenshot on it is a real capture of the app running on the demo kitchen's data
 * (public/landing/app-*.webp), so the page never promises a screen the product doesn't have, and nothing on it is an
 * invented statistic or testimonial. It only describes features that are live.
 *
 * What the page says about billing has to match the server: the free trial length is TRIAL_DAYS (src/utils/trial.ts,
 * shared with the server) and Razorpay collects a payment mandate to start it, so the copy says a card is required and
 * never "no credit card". The monthly price is defined once here; it must equal the amount of the Razorpay plan in
 * RAZORPAY_PLAN_ID (in INR). It does not say whether the price includes GST: the plan is to make the price inclusive once
 * the business is GST-registered (see docs/PROJECT_STATE.md); add that here on that day, not before.
 *
 * The look (Nov 2026) is deliberately quiet: white and pale grey sections, big centred headlines, black buttons, and the
 * app itself on a laptop, a tablet and a phone. Stockpot's teal is kept for the logo and small details. Fonts are the
 * app's own (src/index.css): Manrope for text and JetBrains Mono for figures. Sections rise into view as they are reached
 * (Reveal, off for visitors who ask for reduced motion).
 */
const PRICE = { symbol: '₹', amount: '2,400', period: 'month' };

/**
 * Before launch the trial is not offered: every "start your free trial" becomes a "Join the waitlist", and the page says
 * nothing about a trial or a card. The demo kitchen still works. Set to false on launch day to bring the trial copy and
 * buttons back.
 */
const LAUNCHING_SOON = true;
const SOON = 'Launching soon';
/**
 * Whether the page shows PRICE. Hidden before launch: the page says pricing comes at launch, offers the first
 * FOUNDING_CUSTOMERS a founding discount, and asks visitors to join the waitlist (#waitlist) instead.
 */
const SHOW_PRICE = false;
const FOUNDING_LINE = `The first ${FOUNDING_CUSTOMERS} customers get a special founding discount.`;
/**
 * Where the page sends visitors into the app. Before launch, only to the demo: /app?demo shows nothing but the demo
 * kitchen's button (App's DemoOnlyScreen), so the page offers no sign-in or sign-up. Owners already signed up use /app.
 */
const DEMO_LINK = '/app?demo';
const APP_LINK = LAUNCHING_SOON ? DEMO_LINK : '/app';

const WRAP = 'w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8';
const SECTION = 'py-16 sm:py-20 lg:py-24';
const WASH = 'bg-[#F4F5F6]';
const MONO = 'font-mono';
const H2 = 'text-3xl sm:text-4xl lg:text-[44px] font-extrabold tracking-[-0.035em] leading-[1.05] text-balance';
const BTN_DARK = 'whitespace-nowrap inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full bg-[#111316] hover:bg-black text-white font-bold transition-colors active:scale-[0.98]';
const BTN_LINK = 'whitespace-nowrap inline-flex items-center justify-center gap-1.5 h-12 px-5 rounded-full text-ink font-semibold hover:bg-[#F4F5F6] transition-colors';
const BEZEL = 'bg-[#1B1D20] shadow-[0_18px_34px_rgba(0,0,0,0.18)]';

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
  ...(LAUNCHING_SOON ? [{
    q: 'Is there a launch offer?',
    a: `Yes. The first ${FOUNDING_CUSTOMERS} customers to subscribe when Stockpot launches get a special founding discount. Join the waitlist and you'll hear first.`,
  }] : []),
  {
    q: 'Can I try it before I pay?',
    a: LAUNCHING_SOON
      ? 'Stockpot is launching soon. Until then, Try the demo at the top of this page opens a demo kitchen to explore, with nothing to sign up for.'
      : `Yes. The ${TRIAL_DAYS}-day trial is free: a card is required to start, and you won't be charged if you cancel before it ends. You can also explore the demo kitchen from the sign-in screen without signing up.`,
  },
];

/**
 * The three answers an owner wants each morning. The figures are the demo kitchen's own, the same ones the screenshots
 * show (yesterday: ₹3,600 of sales, ₹1,102 true profit), so the page and the pictures tell one story.
 */
const ANSWERS: { title: string; tint: string; rows: [string, string, 'neg' | 'pos' | '' ][]; caption: [string, string] }[] = [
  {
    title: 'How much money you made', tint: 'bg-white border-[#E7E9EB]',
    rows: [['Sales', '₹3,600', ''], ['Ingredients', '−₹1,428', 'neg'], ['Packaging, fees and fixed costs', '−₹1,070', 'neg'], ['True profit yesterday', '₹1,102', 'pos']],
    caption: ['Money.', 'Every cost comes off every order, so the number is the one you keep.'],
  },
  {
    title: 'What needs restocking', tint: 'bg-[#EEF7F6] border-[#D6EAE8]',
    rows: [['Instant dry yeast', 'running low', ''], ['Unsalted butter', 'out Thu 8 Oct', ''], ['Butter to reorder', '8,400 g', ''], ['Batches to check', '3', '']],
    caption: ['Stock.', 'Log a bake and the ingredients come off by themselves.'],
  },
  {
    title: 'Whose order is due', tint: 'bg-[#FFF8EC] border-[#F4E6CC]',
    rows: [['Butter Croissant × 6', 'today', ''], ['Chocolate Muffin × 12', 'tomorrow', ''], ['Whole Wheat Atta Loaf × 4', 'tomorrow', ''], ['Kavya Menon owes', '₹600', '']],
    caption: ['Orders.', 'Pre-orders, advances and who still owes you, in one list.'],
  },
];

/** From a WhatsApp message to a bill, in three phone screens from the demo kitchen. */
const STEPS = [
  { src: '/landing/app-preorder-message.webp', alt: "Booking a pre-order on a phone, filled in from Anita's WhatsApp message: 12 butter croissants and 6 chocolate muffins", title: 'Paste the message', body: '12 croissants and 6 muffins for Thursday, ₹500 advance.' },
  { src: '/landing/app-preorder-details.webp', alt: "The pre-order's customer, phone, delivery address and ₹500 advance, with the balance due at handover", title: 'Check and book', body: 'The advance is noted, and the balance waits for handover.' },
  { src: '/landing/app-bill.webp', alt: "Anita's bill: ₹2,520 total, ₹500 advance taken off, ₹2,020 balance due, with a UPI code", title: 'Send the bill', body: 'Balance due ₹2,020, with a code to pay by UPI.' },
];

/** Six features, one line each. Every one is live. */
const FEATURES = [
  { icon: MessageCircle, title: 'Orders from WhatsApp', body: "Paste a customer's message and the order fills itself in, advance and all." },
  { icon: Wallet, title: 'Money made on every order', body: 'Ingredients, packaging, delivery, discounts and payment fees come off. GST stays separate.' },
  { icon: TrendingUp, title: 'Margin alerts, quarterly prices', body: 'Know the day butter eats your margin. Every quarter, set new prices for all of it at once.' },
  { icon: Box, title: 'Stock that keeps up', body: 'Every bake takes its ingredients out. Stockpot says what to reorder and how much.' },
  { icon: Sun, title: 'A briefing every morning', body: "Yesterday's true profit, and what needs you today, in plain words." },
  { icon: Camera, title: 'Photos into posts', body: 'A photo of your food, made ready for Instagram, with a caption and hashtags.' },
];

const PLAN_FEATURES = [
  'Unlimited recipes, orders, pre-orders and production runs',
  'Bills with UPI QR, statements and menu PDFs over WhatsApp',
  'True profit, margin alerts and a quarterly price review',
  'Morning briefing and Ask Your Business, with fair daily limits',
  'GST for India, reorder suggestions, wastage and R&D tracking',
  'Promote: photos made ready for Instagram, with captions and hashtags',
];

/** The pot mark and the STOCKPOT wordmark, as in the logo. */
const Logo: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'md' }) => (
  <span className="flex items-center gap-2">
    <img src="/logo-icon.png" alt="" className={size === 'md' ? 'w-9 h-9 object-contain' : 'w-7 h-7 object-contain'} />
    <span className={`font-extrabold uppercase tracking-[0.02em] text-primary leading-none ${size === 'md' ? 'text-lg sm:text-xl' : 'text-base'}`}>Stockpot</span>
  </span>
);

/** "Join the waitlist" (before launch) or "Start your free trial" (after): the page's one action. */
const MainAction: React.FC<{ className?: string }> = ({ className = '' }) => LAUNCHING_SOON
  ? <a href="#waitlist" className={`${BTN_DARK} ${className}`}>Join the waitlist</a>
  : <Link to="/app" className={`${BTN_DARK} ${className}`}>Start your {TRIAL_DAYS}-day free trial</Link>;

/**
 * The app on three devices: the dashboard on a laptop, orders on a tablet, a pre-order on a phone. On a phone the phone
 * comes to the front and the laptop sits behind it; the tablet shows only on wide screens.
 */
const Devices: React.FC = () => (
  <div className="relative w-full max-w-[900px] h-[340px] sm:h-[380px] mt-10 sm:mt-12" aria-label="Stockpot on a laptop, a tablet and a phone" role="group">
    <div className="absolute z-10 bottom-14 -right-16 w-[300px] md:right-auto md:left-1/2 md:-translate-x-1/2 md:bottom-[18px] md:w-[560px]">
      <div className="bg-[#1B1D20] rounded-t-[14px] rounded-b-[4px] p-2 md:p-2.5">
        <img
          src="/landing/app-dashboard.webp" width={1366} height={1024}
          alt="The Stockpot dashboard on a laptop: pre-orders to prepare and yesterday's briefing, with ₹1,102 true profit"
          decoding="async" fetchPriority="high"
          className="block w-full h-[170px] md:h-[316px] object-cover object-left-top rounded-[5px]"
        />
      </div>
      <div className="h-2.5 md:h-3.5 -mx-4 md:-mx-8 rounded-b-[14px] bg-gradient-to-b from-[#D8DADD] to-[#A9ADB2]" />
    </div>
    <div className={`hidden lg:block absolute z-20 right-0 bottom-0 w-[270px] h-[210px] p-2 rounded-2xl rotate-3 ${BEZEL}`}>
      <img
        src="/landing/app-orders.webp" width={1366} height={1024}
        alt="Customer and courier orders on a tablet: 17 orders, ₹19,200 booked, and one customer's payment pending"
        loading="lazy" decoding="async"
        className="block w-full h-full object-cover object-left-top rounded-[9px]"
      />
    </div>
    <div className={`absolute z-30 bottom-0 left-1/2 -ml-24 md:ml-0 md:left-[3%] w-[152px] h-[320px] p-[7px] rounded-[28px] -rotate-3 ${BEZEL}`}>
      <img
        src="/landing/app-preorder-message.webp" width={780} height={1688}
        alt="A pre-order on a phone, filled in from a customer's WhatsApp message"
        decoding="async"
        className="block w-full h-full object-cover object-top rounded-[22px]"
      />
    </div>
  </div>
);

const LandingPage: React.FC = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [scrolled, setScrolled] = useState(false);

  // Smooth-scroll the in-page anchors while the page is open.
  useEffect(() => {
    const previous = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => { document.documentElement.style.scrollBehavior = previous; };
  }, []);

  // The header gets a line under it once the page has moved under it.
  useEffect(() => onScrollFrames(() => setScrolled(window.scrollY > 30)), []);

  return (
    <div className="min-h-screen bg-white text-[#111316] font-sans antialiased selection:bg-primary-light/40 overflow-x-clip">
      {/* Header */}
      <header className={`sticky top-0 z-50 bg-white/90 backdrop-blur-md transition-shadow duration-300 ${scrolled ? 'shadow-[0_1px_0_#E7E9EB]' : ''}`}>
        <div className={`${WRAP} h-16 sm:h-[72px] flex items-center justify-between gap-4`}>
          <a href="#top" aria-label="Stockpot home"><Logo /></a>
          <nav aria-label="Sections" className="hidden md:flex items-center gap-7 text-sm font-semibold text-[#5B6168]">
            {[['#how', 'How it works'], ['#features', 'Features'], ['#pricing', 'Pricing'], ['#faq', 'FAQ']].map(([href, label]) => (
              <a key={href} href={href} className="hover:text-ink transition-colors">{label}</a>
            ))}
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            <Link to={APP_LINK} className="whitespace-nowrap text-sm font-semibold text-[#5B6168] hover:text-ink rounded-full px-3 py-2 transition-colors">
              {LAUNCHING_SOON ? <><span className="sm:hidden">Demo</span><span className="hidden sm:inline">Try the demo</span></> : 'Sign In / Demo'}
            </Link>
            {LAUNCHING_SOON
              ? <a href="#waitlist" className="whitespace-nowrap inline-flex items-center h-10 px-4 rounded-full bg-[#111316] text-white text-sm font-bold hover:bg-black transition-colors"><span className="sm:hidden">Join</span><span className="hidden sm:inline">Join the waitlist</span></a>
              : <Link to="/app" className="whitespace-nowrap inline-flex items-center h-10 px-4 rounded-full bg-[#111316] text-white text-sm font-bold hover:bg-black transition-colors">Start Free Trial</Link>}
          </div>
        </div>
      </header>

      <main id="top">
        {/* 1. Hero: the promise, then the app on three devices, then the problem in a sentence */}
        <section className="pt-10 sm:pt-14 overflow-hidden">
          <div className={`${WRAP} flex flex-col items-center text-center`}>
            <img src="/logo-icon.png" alt="" className="hidden md:block w-16 h-16 object-contain mb-5" />
            <p className={`${MONO} text-[11px] sm:text-xs font-semibold uppercase tracking-[0.12em] text-[#8A8F96] mb-4`}>
              For home bakers, home chefs, tiffin services and small cloud kitchens
            </p>
            <h1 className="text-[40px] sm:text-6xl lg:text-[68px] font-extrabold tracking-[-0.045em] leading-[0.98] max-w-[12ch] text-balance">
              Stop guessing how much money you made.
            </h1>
            <p className="mt-5 text-base sm:text-lg text-[#5B6168] leading-relaxed max-w-[46ch]">
              Stockpot tracks your ingredients, orders and costs, and shows what every order actually earns you: after packaging, delivery, discounts, payment fees and GST.
            </p>
            <div className="mt-7 flex flex-col sm:flex-row items-center gap-2 sm:gap-3 w-full sm:w-auto">
              <MainAction className="w-full sm:w-auto" />
              <Link to={DEMO_LINK} className={`${BTN_LINK} w-full sm:w-auto`}>Explore the demo kitchen <ArrowRight size={16} /></Link>
            </div>
            <p className="mt-3 text-xs sm:text-sm text-[#8A8F96]">
              {SHOW_PRICE ? <>{PRICE.symbol}{PRICE.amount}/{PRICE.period}{LAUNCHING_SOON ? '' : ' after the trial'}</> : <>{SOON}. {FOUNDING_LINE}</>}
            </p>
            <Devices />
          </div>
          <div className={`${WRAP} ${SECTION} flex flex-col items-center text-center`}>
            <Reveal className="flex flex-col items-center">
              <p className={`${MONO} flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8A8F96] before:content-[''] before:w-6 before:h-px before:bg-[#C9CDD1]`}>
                The problem with notebooks and WhatsApp
              </p>
              <h2 className="mt-5 text-2xl sm:text-3xl lg:text-[32px] font-bold tracking-[-0.025em] leading-[1.25] max-w-[26ch] text-[#B9BEC3] text-balance">
                Busy every day, still not sure how much money you made? Butter goes up, a discount slips through, the courier takes a cut.{' '}
                <span className="text-ink">Stockpot does the sums, so you know what you actually kept.</span>
              </h2>
            </Reveal>
          </div>
        </section>

        {/* 2. Three answers, every morning */}
        <section className={`${WASH} ${SECTION}`}>
          <div className={`${WRAP} flex flex-col items-center text-center`}>
            <Reveal><h2 className={H2}>Three answers. That&apos;s it.</h2></Reveal>
            <div className="mt-10 grid md:grid-cols-3 gap-6 md:gap-5 w-full max-w-4xl text-left">
              {ANSWERS.map(({ title, tint, rows, caption }, i) => (
                <Reveal key={title} delay={i * 0.06}>
                  <div className={`rounded-2xl border p-4 ${tint}`}>
                    <h3 className="text-sm font-extrabold mb-1">{title}</h3>
                    <dl>
                      {rows.map(([label, value, tone]) => (
                        <div key={label} className="flex items-center justify-between gap-3 py-2 border-b border-black/5 last:border-0 text-[13px]">
                          <dt className={tone === 'pos' ? 'font-bold' : ''}>{label}</dt>
                          <dd className={`${MONO} m-0 font-semibold tabular-nums ${tone === 'neg' ? 'text-[#B23A4F]' : tone === 'pos' ? 'text-[#13855F]' : ''}`}>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                  <p className="mt-3 text-[13px] text-[#5B6168] leading-relaxed"><strong className="text-ink">{caption[0]}</strong> {caption[1]}</p>
                </Reveal>
              ))}
            </div>
            <Reveal className="mt-12 flex flex-col items-center gap-5">
              <p className="text-base sm:text-lg font-semibold max-w-[40ch] text-balance">You already think about your kitchen this way. Stockpot just keeps the numbers straight.</p>
              {LAUNCHING_SOON && <a href="#waitlist" className={BTN_DARK}>Join the waitlist</a>}
            </Reveal>
          </div>
        </section>

        {/* 3. How it works: from a WhatsApp message to a bill */}
        <section id="how" className={`scroll-mt-20 ${SECTION}`}>
          <div className={`${WRAP} flex flex-col items-center text-center`}>
            <Reveal className="flex flex-col items-center">
              <h2 className={H2}>Take orders the way customers send them.</h2>
              <p className="mt-4 text-base sm:text-lg text-[#5B6168] leading-relaxed max-w-[52ch]">
                Paste a WhatsApp message and Stockpot fills in the order, advance and all. The bill goes back on WhatsApp with a UPI code for what&apos;s still due.
              </p>
            </Reveal>
            <ol className="mt-12 grid sm:grid-cols-3 gap-10 sm:gap-6 w-full max-w-4xl">
              {STEPS.map(({ src, alt, title, body }, i) => (
                <li key={title}>
                  <Reveal delay={i * 0.08} className="flex flex-col items-center gap-3">
                    <div className={`w-[200px] aspect-[780/1688] p-[7px] rounded-[30px] ${BEZEL}`}>
                      <img src={src} alt={alt} width={780} height={1688} loading="lazy" decoding="async" className="block w-full h-full object-cover object-top rounded-[24px]" />
                    </div>
                    <span className={`${MONO} mt-2 text-[11px] font-semibold tracking-[0.1em] text-[#8A8F96]`}>0{i + 1}</span>
                    <h3 className="text-base font-extrabold">{title}</h3>
                    <p className="text-sm text-[#5B6168] leading-relaxed max-w-[26ch]">{body}</p>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 4. Features: six, one line each */}
        <section id="features" className={`scroll-mt-20 ${WASH} ${SECTION}`}>
          <div className={`${WRAP} flex flex-col items-center text-center`}>
            <Reveal><h2 className={H2}>Built for kitchens that cook every day.</h2></Reveal>
            <div className="mt-10 grid sm:grid-cols-2 w-full max-w-3xl text-left border-t border-[#E2E4E7]">
              {FEATURES.map(({ icon: Icon, title, body }, i) => (
                <Reveal key={title} delay={(i % 2) * 0.06} className={`px-5 sm:px-6 py-6 border-b border-[#E2E4E7] ${i % 2 === 0 ? 'sm:border-r' : ''}`}>
                  <span className="w-8 h-8 rounded-[9px] border border-[#E2E4E7] bg-white flex items-center justify-center mb-3"><Icon size={16} aria-hidden="true" /></span>
                  <h3 className="text-[15px] font-extrabold mb-1">{title}</h3>
                  <p className="text-sm text-[#6B7178] leading-relaxed">{body}</p>
                </Reveal>
              ))}
            </div>
            <Reveal className="mt-8 flex flex-col items-center gap-5">
              <p className="text-[#5B6168]"><strong className="font-bold text-ink">Built for India:</strong> rupees, GST, UPI, WhatsApp, and grams to litres.</p>
              {LAUNCHING_SOON && <a href="#waitlist" className={BTN_DARK}>Join the waitlist</a>}
            </Reveal>
          </div>
        </section>

        {/* 5. Pricing */}
        <section id="pricing" className={`scroll-mt-20 ${SECTION}`}>
          <div className={`${WRAP} flex flex-col items-center text-center`}>
            <Reveal className="flex flex-col items-center">
              <h2 className={H2}>One plan. Everything included.</h2>
              <p className="mt-4 text-lg text-[#5B6168]">{LAUNCHING_SOON ? `${SOON}. Pricing will be announced at launch.` : `Try it free for ${TRIAL_DAYS} days.`}</p>
            </Reveal>
            <Reveal className="mt-10 w-full max-w-2xl grid gap-3 text-left">
              <div className="rounded-2xl border border-[#E7E9EB] p-5 sm:p-6 flex flex-wrap items-center justify-between gap-5">
                <div>
                  <p className={`${MONO} text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8A8F96]`}>Stockpot Pro</p>
                  {SHOW_PRICE
                    ? <p className={`${MONO} mt-1 text-3xl font-bold tracking-tight tabular-nums`}>{PRICE.symbol}{PRICE.amount}<span className="text-base text-[#8A8F96] font-medium"> / {PRICE.period}</span></p>
                    : <p className="mt-1 text-3xl font-extrabold tracking-tight">Pricing at launch</p>}
                </div>
                {LAUNCHING_SOON && <p className="text-sm text-[#5B6168] max-w-[34ch] leading-relaxed">Founding offer: the first {FOUNDING_CUSTOMERS} customers get a special discount.</p>}
              </div>
              <ul className="rounded-2xl border border-[#E7E9EB] p-5 sm:p-6 grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {PLAN_FEATURES.map(f => (
                  <li key={f} className="flex items-start gap-2.5"><Check size={16} className="text-primary shrink-0 mt-0.5" aria-hidden="true" /><span>{f}</span></li>
                ))}
              </ul>
            </Reveal>
            <Reveal className="mt-8 flex flex-col items-center gap-3">
              <MainAction />
              <p className="text-xs text-[#8A8F96]">
                {LAUNCHING_SOON
                  ? <>Sign-ups open soon. Until then, <Link to={DEMO_LINK} className="text-ink font-semibold underline underline-offset-2">try the demo kitchen</Link>.</>
                  : <>Card required to start. You won&apos;t be charged if you cancel before the trial ends.</>}
              </p>
            </Reveal>
          </div>
        </section>

        {/* 5b. Before launch: the waitlist */}
        {LAUNCHING_SOON && (
          <section id="waitlist" className={`scroll-mt-20 ${WASH} ${SECTION}`}>
            <div className="w-full max-w-xl mx-auto px-4 sm:px-6">
              <Reveal className="text-center mb-8">
                <h2 className={H2}>Join the waitlist</h2>
                <p className="mt-4 text-lg text-[#5B6168]">Stockpot is launching soon. Leave your details and we&apos;ll tell you the day it opens. {FOUNDING_LINE}</p>
              </Reveal>
              <Reveal className="bg-white rounded-2xl border border-[#E7E9EB] p-5 sm:p-8">
                <WaitlistForm />
              </Reveal>
            </div>
          </section>
        )}

        {/* 6. FAQ */}
        <section id="faq" className={`scroll-mt-20 ${SECTION}`}>
          <div className="w-full max-w-2xl mx-auto px-4 sm:px-6">
            <Reveal className="text-center mb-10"><h2 className={H2}>Questions, answered.</h2></Reveal>
            <div className="grid gap-2.5">
              {FAQS.map(({ q, a }, i) => {
                const open = openFaq === i;
                return (
                  <div key={q} className="rounded-xl border border-[#E7E9EB] bg-white">
                    <h3>
                      <button
                        type="button"
                        onClick={() => setOpenFaq(open ? null : i)}
                        aria-expanded={open}
                        aria-controls={`faq-panel-${i}`}
                        id={`faq-button-${i}`}
                        className="w-full flex items-center justify-between gap-4 text-left px-4 sm:px-5 py-4 text-[15px] font-bold"
                      >
                        <span>{q}</span>
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${open ? 'bg-[#111316] text-white' : 'border border-[#E7E9EB] text-[#8A8F96]'}`} aria-hidden="true">
                          {open ? <Minus size={13} /> : <Plus size={13} />}
                        </span>
                      </button>
                    </h3>
                    <div id={`faq-panel-${i}`} role="region" aria-labelledby={`faq-button-${i}`} hidden={!open} className="px-4 sm:px-5 pb-4 -mt-1 text-sm text-[#5B6168] leading-relaxed">
                      {a}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* 7. Closing */}
        <section className={`${WASH} pt-20 sm:pt-24 pb-4`}>
          <Reveal className={`${WRAP} flex flex-col items-center text-center`}>
            <h2 className="text-4xl sm:text-5xl lg:text-[64px] font-extrabold tracking-[-0.045em] leading-none text-balance">Stop guessing. Start knowing.</h2>
            <div className="mt-8 flex flex-col sm:flex-row items-center gap-2 sm:gap-3 w-full sm:w-auto">
              <MainAction className="w-full sm:w-auto" />
              <Link to={APP_LINK} className={`${BTN_LINK} w-full sm:w-auto`}>{LAUNCHING_SOON ? 'Explore the demo kitchen' : 'Sign in'}</Link>
            </div>
            <p className="mt-3 text-sm text-[#8A8F96]">
              {LAUNCHING_SOON ? 'Stockpot is launching soon. Explore the demo kitchen today and see what your true profit could look like.' : `Start your ${TRIAL_DAYS}-day free trial and see your true profit by tomorrow morning.`}
            </p>
          </Reveal>
        </section>
      </main>

      {/* 8. Footer, with the line the brand stands on */}
      <footer className={`${WASH} pt-14 overflow-hidden`}>
        <div className={`${WRAP} flex flex-col items-center text-center gap-6`}>
          <img src="/landing/logo-tagline.webp" alt="Stockpot: inventory and margin tracking" width={1296} height={957} loading="lazy" className="w-44 sm:w-52 h-auto mix-blend-multiply" />
          <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-medium text-[#5B6168]">
            <a href="#features" className="hover:text-ink">Features</a>
            <a href="#pricing" className="hover:text-ink">Pricing</a>
            <a href="#faq" className="hover:text-ink">FAQ</a>
            <Link to={APP_LINK} className="hover:text-ink">{LAUNCHING_SOON ? 'Try the demo' : 'Log in'}</Link>
            <Link to="/terms" className="hover:text-ink">Terms of Service</Link>
            <Link to="/privacy" className="hover:text-ink">Privacy Policy</Link>
          </nav>
          <p className="text-xs text-[#8A8F96]">&copy; {new Date().getFullYear()} Stockpot. All rights reserved.</p>
          <p
            aria-hidden="true"
            className="select-none mt-4 text-[44px] sm:text-[80px] lg:text-[104px] font-extrabold tracking-[-0.05em] leading-[0.92] max-w-[13ch] text-balance text-transparent bg-clip-text bg-gradient-to-b from-[#E2E5E8] to-[#F4F5F6] [-webkit-text-stroke:1px_#DCDFE2] pb-6"
          >
            The CFO of your food business.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
