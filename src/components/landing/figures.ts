/**
 * The figures behind the landing page's four infographics, and every bar width worked out from them. The figures are the demo
 * kitchen's (a Butter Croissant, Anita's pre-order) or labelled worked examples; the widths are arithmetic on those figures, never
 * eyeballed, so a bar is always as long as its number says (see the tests).
 */

/** ₹ amount, with Indian digit grouping and a fixed number of decimals. */
export const rupees = (n: number, decimals = 0): string =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const pct = (part: number, whole: number) => round2((part / whole) * 100);

// ─── 1. Same price, smaller margin ──────────────────────────────────────────

export const CREEP = {
  /** What the croissant sells for, before and after. */
  price: 150,
  suggestedPrice: 185,
  /** What it cost to make when priced, and after butter went up 30%. */
  costThen: 57.12,
  costNow: 69.95,
  butterRisePct: 30,
} as const;

export interface CreepRow {
  id: 'then' | 'now' | 'suggested';
  label: string;
  cost: number;
  price: number;
  /** The whole bar's width, as a share of the widest bar (the suggested price). */
  barWidthPct: number;
  /** The cost part's width, as a share of its own bar. */
  costWidthPct: number;
  /** The margin kept, in whole percent. */
  marginPct: number;
}

const creepRow = (id: CreepRow['id'], label: string, cost: number, price: number): CreepRow => ({
  id, label, cost, price,
  barWidthPct: pct(price, CREEP.suggestedPrice),
  costWidthPct: pct(cost, price),
  marginPct: Math.round(((price - cost) / price) * 100),
});

export const CREEP_ROWS: CreepRow[] = [
  creepRow('then', 'When you priced it', CREEP.costThen, CREEP.price),
  creepRow('now', 'Today, same price', CREEP.costNow, CREEP.price),
  creepRow('suggested', 'At the suggested price', CREEP.costNow, CREEP.suggestedPrice),
];

/** How much more a croissant costs to make now. */
export const CREEP_COST_RISE = round2(CREEP.costNow - CREEP.costThen);

export const creepAriaLabel = (): string => {
  const [then, now, suggested] = CREEP_ROWS;
  return `Butter Croissant: when priced, cost ${rupees(then.cost, 2)} and ${then.marginPct}% margin at ${rupees(then.price)}. ` +
    `After butter rose ${CREEP.butterRisePct}%, cost ${rupees(now.cost, 2)} and ${now.marginPct}% margin at the same ${rupees(now.price)}. ` +
    `At Stockpot's suggested ${rupees(suggested.price)}, the margin is back to ${suggested.marginPct}%.`;
};

// ─── 2. From a WhatsApp message to paid in full ─────────────────────────────

export const JOURNEY = {
  lines: [
    { name: 'butter croissants', quantity: 12, unitPrice: 150 },
    { name: 'chocolate muffins', quantity: 6, unitPrice: 120 },
  ],
  advance: 500,
} as const;

export const JOURNEY_TOTAL = JOURNEY.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
export const JOURNEY_BALANCE = JOURNEY_TOTAL - JOURNEY.advance;
/** The advance's width as a share of the order total. */
export const JOURNEY_ADVANCE_PCT = pct(JOURNEY.advance, JOURNEY_TOTAL);

export const journeyAriaLabel = (): string =>
  `Order total ${rupees(JOURNEY_TOTAL)}: ${rupees(JOURNEY.advance)} advance paid at booking, ${rupees(JOURNEY_BALANCE)} balance paid through the bill's UPI QR.`;

// ─── 3. ₹1,200 in sales, ₹603 made ──────────────────────────────────────────

export const ORDER = {
  quantity: 8,
  unitPrice: 150,
  ingredients: 396.96,
  packaging: 60,
  courier: 90,
  discount: 50,
} as const;

export const ORDER_SALES = ORDER.quantity * ORDER.unitPrice;
export const ORDER_MADE = round2(ORDER_SALES - ORDER.ingredients - ORDER.packaging - ORDER.courier - ORDER.discount);

export interface WaterfallRow {
  id: 'sales' | 'ingredients' | 'packaging' | 'courier' | 'discount' | 'made';
  name: string;
  note?: string;
  amount: number;
  kind: 'total' | 'cost' | 'made';
  /** Where the bar starts and how long it is, as shares of the sales bar. */
  leftPct: number;
  widthPct: number;
}

/** The costs come off the sales bar from the right, one after another; what is left is what was made. */
export function waterfall(): WaterfallRow[] {
  let remaining = ORDER_SALES;
  const cost = (id: WaterfallRow['id'], name: string, note: string, amount: number): WaterfallRow => {
    remaining = round2(remaining - amount);
    return { id, name, note, amount, kind: 'cost', leftPct: pct(remaining, ORDER_SALES), widthPct: pct(amount, ORDER_SALES) };
  };
  const rows: WaterfallRow[] = [
    { id: 'sales', name: 'Sales', note: `${ORDER.quantity} × ${rupees(ORDER.unitPrice)}`, amount: ORDER_SALES, kind: 'total', leftPct: 0, widthPct: 100 },
    cost('ingredients', 'Ingredients', 'butter, maida, sugar, yeast', ORDER.ingredients),
    cost('packaging', 'Packaging', `${ORDER.quantity} pastry boxes`, ORDER.packaging),
    cost('courier', 'Courier', 'paid to the delivery app', ORDER.courier),
    cost('discount', 'Discount', `${rupees(ORDER.discount)} off the order`, ORDER.discount),
  ];
  rows.push({ id: 'made', name: 'Made on this order', amount: ORDER_MADE, kind: 'made', leftPct: 0, widthPct: pct(ORDER_MADE, ORDER_SALES) });
  return rows;
}

export const orderAriaLabel = (): string =>
  `Order of ${ORDER.quantity} Butter Croissants: sales ${rupees(ORDER_SALES)}, minus ingredients ${rupees(ORDER.ingredients, 2)}, ` +
  `packaging ${rupees(ORDER.packaging)}, courier ${rupees(ORDER.courier)} and discount ${rupees(ORDER.discount)}, leaves ${rupees(ORDER_MADE, 2)} made.`;
