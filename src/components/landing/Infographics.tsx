/**
 * The landing page's four infographics, built as HTML and CSS (not images) so the text stays sharp and readable and the layout
 * reflows on phones. Layout, colours and type follow the reference in the content update (infographics.html); the figures and
 * every bar width come from ./figures, so each bar is as long as its number says. Where a picture carries numbers it has
 * role="img" and an aria-label that states them. Styles are the `.ig-*` rules in src/index.css, which respond to the width of the
 * space the infographic is in (container queries), not the width of the screen.
 */
import React from 'react';
import {
  CREEP, CREEP_COST_RISE, CREEP_ROWS, JOURNEY, JOURNEY_ADVANCE_PCT, JOURNEY_BALANCE, JOURNEY_TOTAL, ORDER, ORDER_MADE,
  creepAriaLabel, journeyAriaLabel, orderAriaLabel, rupees, waterfall,
} from './figures';

type HeadingTag = 'h2' | 'h3' | 'h4';

/** The card every infographic sits in: an eyebrow, a title, a line, then the picture. */
const Card: React.FC<{
  eyebrow: string; title: string; lede: string; as?: HeadingTag; showHeading?: boolean; labelledBy: string; children: React.ReactNode;
}> = ({ eyebrow, title, lede, as: Heading = 'h3', showHeading = true, labelledBy, children }) => (
  <div className="ig-frame">
    <section className="ig" aria-labelledby={showHeading ? labelledBy : undefined}>
      {showHeading && (
        <>
          <div className="ig-eyebrow">{eyebrow}</div>
          <Heading id={labelledBy} className="ig-title">{title}</Heading>
        </>
      )}
      <p className="ig-lede">{lede}</p>
      {children}
    </section>
  </div>
);

const Foot: React.FC<{ lead: string; children: React.ReactNode }> = ({ lead, children }) => (
  <p className="ig-foot"><b>{lead}</b> {children}</p>
);

/** 1. The Butter Croissant's margin falls when butter rises, and returns at the suggested price. */
export const PriceCreepGraphic: React.FC<{ as?: HeadingTag }> = ({ as }) => (
  <Card
    eyebrow="Example · Butter Croissant" title="Same price. Smaller margin." as={as} labelledBy="ig-creep-title"
    lede={`Butter went up ${CREEP.butterRisePct}%. The croissant still sells for ${rupees(CREEP.price)}, so the extra cost comes straight out of the margin. Stockpot spots it and suggests the price that wins it back.`}
  >
    <div className="ig-creep" role="img" aria-label={creepAriaLabel()}>
      {CREEP_ROWS.map((row, i) => (
        <React.Fragment key={row.id}>
          {i === 1 && <div className="ig-cnote"><span className="pill">Butter +{CREEP.butterRisePct}% · cost +{rupees(CREEP_COST_RISE, 2)} a croissant</span></div>}
          {i === 2 && <div className="ig-cnote good"><span className="pill">Stockpot suggests {rupees(CREEP.suggestedPrice)}</span></div>}
          <div className="ig-crow" aria-hidden="true">
            <div>
              <div className="ig-clabel-t">{row.label}</div>
              <div className="ig-clabel-s">Cost {rupees(row.cost, 2)}</div>
            </div>
            <div className="ig-ctrack">
              <div className="ig-cin">
                <div className="ig-cbar" style={{ width: `${row.barWidthPct}%` }}>
                  <div className="cost" style={{ width: `${row.costWidthPct}%` }}>{rupees(Math.round(row.cost))}</div>
                  <div className="mar"><span>{row.marginPct}% margin</span></div>
                </div>
                <div className="ig-cprice" style={{ left: `${row.barWidthPct}%` }}>{rupees(row.price)}</div>
              </div>
            </div>
          </div>
        </React.Fragment>
      ))}
    </div>
    <div className="ig-key">
      <span><i style={{ background: '#E4536B' }} />Ingredients and packaging</span>
      <span><i style={{ background: '#1FA97A' }} />What you keep</span>
    </div>
    <Foot lead="From Stockpot’s demo kitchen.">Margins are before GST and delivery.</Foot>
  </Card>
);

/** 2. A WhatsApp message becomes a pre-order with an advance; the bill's QR asks only for the balance. */
export const OrderJourneyGraphic: React.FC<{ as?: HeadingTag }> = ({ as }) => (
  <Card
    eyebrow="Example · Anita’s order" title="From a WhatsApp message to paid in full" as={as} labelledBy="ig-journey-title"
    lede="Paste the message, take the advance, and the bill asks only for what’s still due."
  >
    <ol className="ig-tl">
      <li className="ig-step">
        <div className="dot">1</div>
        <h5>She messages you</h5>
        <div className="card wa">
          “Can I order {JOURNEY.lines[0].quantity} {JOURNEY.lines[0].name} and {JOURNEY.lines[1].quantity} {JOURNEY.lines[1].name} for Thursday morning? I’ll pay {rupees(JOURNEY.advance)} advance on UPI.”
        </div>
      </li>
      <li className="ig-step">
        <div className="dot">2</div>
        <h5>Stockpot fills the order</h5>
        <div className="card"><span className="k">Pre-order · Thu morning<br />Total {rupees(JOURNEY_TOTAL)}<br />Advance {rupees(JOURNEY.advance)} · UPI</span></div>
      </li>
      <li className="ig-step">
        <div className="dot">3</div>
        <h5>Hand over, send the bill</h5>
        <div className="card">One tap on WhatsApp, with a UPI QR for the <b>{rupees(JOURNEY_BALANCE)}</b> balance, not the full {rupees(JOURNEY_TOTAL)}.</div>
      </li>
      <li className="ig-step">
        <div className="dot">4</div>
        <h5>Paid in full</h5>
        <div className="card">Marked paid. The sale counts on Thursday, the day she gets her order.</div>
      </li>
    </ol>
    <div className="ig-money" role="img" aria-label={journeyAriaLabel()}>
      <div className="lbl" aria-hidden="true"><span>Order total</span><b>{rupees(JOURNEY_TOTAL)}</b></div>
      <div className="ig-mbar" aria-hidden="true">
        <div className="adv" style={{ width: `${JOURNEY_ADVANCE_PCT}%` }}>{rupees(JOURNEY.advance)}</div>
        <div className="bal"><span>{rupees(JOURNEY_BALANCE)} balance via the bill’s QR</span></div>
      </div>
      <div className="ig-key" aria-hidden="true">
        <span><i style={{ background: '#00797B' }} />Advance at booking</span>
        <span><i style={{ background: '#1FA97A' }} />Balance on the bill</span>
      </div>
    </div>
    <Foot lead="Customers who pay later">get one statement for everything they owe, and you see who owes what, customer by customer.</Foot>
  </Card>
);

/** 3. Every cost comes off an order's sales, leaving what it actually made. */
export const WhereMoneyGoesGraphic: React.FC<{ as?: HeadingTag }> = ({ as }) => (
  <Card
    eyebrow="Worked example · one order" title={`${rupees(ORDER.quantity * ORDER.unitPrice)} in sales. ${rupees(Math.round(ORDER_MADE))} made.`} as={as} labelledBy="ig-order-title"
    lede={`Eight Butter Croissants, sent by courier with ${rupees(ORDER.discount)} off. Stockpot takes every cost off the order, so you see what you actually made.`}
  >
    <div className="ig-wf" role="img" aria-label={orderAriaLabel()}>
      {waterfall().map(row => (
        <div key={row.id} className={`ig-wrow ${row.kind === 'total' ? 'tot' : row.kind === 'made' ? 'made' : 'neg'}`} aria-hidden="true">
          <div className="wname">{row.name}{row.note && <small>{row.note}</small>}</div>
          <div className="wtrack"><div className="wbar" style={{ left: `${row.leftPct}%`, width: `${row.widthPct}%` }} /></div>
          <div className="wval">{row.kind === 'cost' ? '−' : ''}{rupees(row.amount, 2)}</div>
        </div>
      ))}
    </div>
    <Foot lead="Then the dashboard goes further:">payment fees, GST, wastage, rent, gas and salaries come off too, so the profit you see is the profit you keep.</Foot>
  </Card>
);

const ICONS = {
  ingredients: <><path d="M6 7h12l-1 13H7z" /><path d="M9 7a3 3 0 0 1 6 0" /></>,
  recipes: <><path d="M5 4h11l3 3v13H5z" /><path d="M9 10h7M9 14h7M9 18h4" /></>,
  orders: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" /></>,
  briefing: <><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" /></>,
} as const;

const STEP_NODES = [
  { n: '01', icon: ICONS.ingredients, title: 'Add your ingredients', body: 'What you have and what you paid, in grams, kilos or pieces.', example: ['Unsalted butter', '₹570 / kg'], then: 'cost per gram' },
  { n: '02', icon: ICONS.recipes, title: 'Build your recipes', body: 'Each one is costed for you, with a suggested price.', example: ['Butter Croissant', `${rupees(CREEP.costNow, 2)} · ${CREEP_ROWS[1].marginPct}%`], then: 'cost and price' },
  { n: '03', icon: ICONS.orders, title: 'Take orders and log bakes', body: 'Paste orders from WhatsApp, book ahead, bill with a UPI QR.', example: [`Anita · ${JOURNEY.lines[0].quantity} croissants`, `Balance ${rupees(JOURNEY_BALANCE)}`], then: 'sales, stock, payments' },
  { n: '04', icon: ICONS.briefing, title: 'Read your morning briefing', body: 'True profit, and what to fix today.', example: ['Raise Butter Croissant', `to ${rupees(CREEP.suggestedPrice)}`], then: '' },
] as const;

const Arrow: React.FC = () => (
  <svg viewBox="0 0 30 16" aria-hidden="true"><path d="M2 8h25M21 2l6 6-6 6" /></svg>
);

/** 4. The four steps as a flow, with what passes between them and what happens when a price changes. */
export const WorkflowGraphic: React.FC<{ as?: HeadingTag; showHeading?: boolean }> = ({ as, showHeading = true }) => (
  <Card
    eyebrow="Simple workflow" title="From ingredients to true profit in four steps" as={as} showHeading={showHeading} labelledBy="ig-flow-title"
    lede="Enter each thing once. Stockpot carries it through to the next step."
  >
    <ol className="ig-flow">
      {STEP_NODES.map((node, i) => (
        <React.Fragment key={node.n}>
          <li className={`ig-node${i === STEP_NODES.length - 1 ? ' last' : ''}`}>
            <div className="n">{node.n}</div>
            <div className="ic"><svg viewBox="0 0 24 24" aria-hidden="true">{node.icon}</svg></div>
            <h5>{node.title}</h5>
            <p>{node.body}</p>
            <div className="ex">{node.example[0]}<br />{node.example[1]}</div>
          </li>
          {node.then && (
            <li className="ig-arrow" aria-hidden="true"><Arrow /><span>{node.then}</span></li>
          )}
        </React.Fragment>
      ))}
    </ol>
    <div className="ig-loop">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6" /><path d="M20 4v5h-5" /></svg>
      <span>Restock at a new price and every recipe that uses it is re-costed. Items that slip below your target margin are flagged the next morning.</span>
    </div>
  </Card>
);
