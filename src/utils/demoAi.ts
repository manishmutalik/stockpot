/**
 * demoAi.ts
 *
 * The AI features in the demo kitchen, without the AI. Anyone can open the demo, so it never calls a model (the server
 * refuses demo accounts: lib/aiGuard). Each feature runs on a ready example instead: the example input (a WhatsApp order,
 * a bake note, a notebook page, a photo, a few questions) and what the AI gives back for it, saved here in the very form
 * the server returns. From there the app's own code takes over as it does in a real account: the order and bake readings
 * go through buildOrderForm and buildProductionForm, the recipe reading through the recipe check screen, so the demo shows
 * exactly what an owner would see. Ask's answers are built here from the app's own figures for the period chosen, in the
 * same tokens the model writes, so the numbers in them are always the demo kitchen's real ones.
 *
 * A visitor who types their own message or picks their own photo is told the demo reads the example, with a link to the
 * waitlist (DEMO_OWN_INPUT). The saved readings are kept small and in one place so they can be replaced by real ones.
 * Every one of them passes the server's own checks (validateParsedOrder and the rest: see the tests).
 */
import type { ParsedOrder } from './orderParse';
import { squash } from './orderParse';
import type { ParsedProduction } from './productionParse';
import type { ParsedRecipes } from './recipeParse';
import type { PromoteLanguage, PromoteReading } from './promote';
import type { BuiltSnapshot } from './aiSnapshot';

/** Where the demo sends a visitor who wants to use the AI on their own things. */
export const DEMO_WAITLIST_LINK = '/#waitlist';

/** What a visitor is told when they give the demo their own message, photo or question. */
export const DEMO_OWN_INPUT = 'In the demo, Stockpot reads the example. Join the waitlist to use it with your own messages and photos.';

/** An example ready in a screen: the text it starts with (if any) and the note above it. */
export interface DemoExample { text: string; note: string }

/** Whether what is in the box is still the example (spacing, case and punctuation aside). */
export const isDemoText = (typed: string, example: string) => squash(typed) === squash(example);

// ── Fill an order from a WhatsApp message ──────────────────────────────────────

export const DEMO_ORDER: DemoExample = {
  text: "Hi didi! Priya Sharma here 😊 Saturday ko ek pineapple cake chahiye 1 kg, eggless if possible, upar 'Happy Birthday Aarav' likhna. Saath mein 6 chocolate muffins. 5 baje pick up karungi. ₹500 advance GPay kar diya hai 🙏",
  note: 'A real kind of WhatsApp order, in Hinglish. Press Fill the form to see it read. In your own account it reads any message you paste.',
};

/**
 * The reading of DEMO_ORDER, as the server returns it. `customerLabel` is the label the message's customer was given on
 * this device (prepareOrderText), so it is filled in when the example is read.
 */
export const demoOrderReading = (customerLabel: string | undefined): ParsedOrder => ({
  lineItems: [
    { nameAsWritten: 'pineapple cake', menuItemId: 'menu_pinecake', quantity: 1 },
    { nameAsWritten: 'chocolate muffins', menuItemId: 'menu_muffin', quantity: 6 },
  ],
  ...(customerLabel && { customerLabel }),
  when: 'Saturday',
  paymentMethod: 'upi',
  notes: "eggless if possible, upar 'Happy Birthday Aarav' likhna",
  advanceAmount: 500,
});

// ── Log a bake from a note ─────────────────────────────────────────────────────

export const DEMO_BAKE: DemoExample = {
  text: 'Aaj: 24 croissants, 12 choc muffins, 3 atta loaves. 2 croissants burnt 😕',
  note: 'A note like one you would jot after baking. Press Fill the form to see it read. In your own account it reads any note you type or paste.',
};

export const DEMO_BAKE_READING: ParsedProduction = {
  lineItems: [
    { nameAsWritten: 'croissants', menuItemId: 'menu_croissant', quantity: 24, wasteUnits: 2 },
    { nameAsWritten: 'choc muffins', menuItemId: 'menu_muffin', quantity: 12 },
    { nameAsWritten: 'atta loaves', menuItemId: 'menu_bread', quantity: 3 },
  ],
};

// ── Read a handwritten recipe ──────────────────────────────────────────────────

/** The notebook page (public/demo), and the name its file is given so the demo knows it is the example. */
export const DEMO_RECIPE_PHOTO = { url: '/demo/recipe-cookies.webp', fileName: 'stockpot-demo-recipe.webp', type: 'image/webp' };

export const DEMO_RECIPE: DemoExample = {
  text: 'Choco chip cookies (makes 20)\n2 cup maida\n1 cup butter (soft)\n3/4 cup sugar\n1 egg\n2 tbsp milk\n1 cup choco chips\nBake 175°C, 12 min',
  note: 'A page from a home baker’s notebook is ready. Press Read recipe to see it turned into a costed recipe. In your own account, photograph or paste your own recipes.',
};

export const DEMO_RECIPE_READING: ParsedRecipes = {
  moreNotRead: false,
  recipes: [{
    name: 'Choco chip cookies',
    makesAsWritten: 'makes 20',
    makes: 20,
    looksLikeComponent: false,
    looksCutOff: false,
    notes: 'Bake 175°C, 12 min',
    ingredients: [
      { nameAsWritten: 'maida', amountAsWritten: '2', amount: 2, unitAsWritten: 'cup', unit: 'cup', kind: 'other', materialId: 'm_flour', unclear: false },
      { nameAsWritten: 'butter', amountAsWritten: '1', amount: 1, unitAsWritten: 'cup', unit: 'cup', kind: 'other', materialId: 'm_butter', unclear: false, note: 'soft' },
      { nameAsWritten: 'sugar', amountAsWritten: '3/4', amount: 0.75, unitAsWritten: 'cup', unit: 'cup', kind: 'other', materialId: 'm_sugar', unclear: false },
      { nameAsWritten: 'egg', amountAsWritten: '1', amount: 1, unit: 'none', kind: 'other', materialId: 'm_eggs', unclear: false },
      { nameAsWritten: 'milk', amountAsWritten: '2', amount: 2, unitAsWritten: 'tbsp', unit: 'tbsp', kind: 'other', materialId: 'm_milk', unclear: false },
      // The one line the owner is asked to check: what a cup of chocolate chips weighs.
      { nameAsWritten: 'choco chips', amountAsWritten: '1', amount: 1, unitAsWritten: 'cup', unit: 'cup', kind: 'other', materialId: 'm_chips', unclear: true },
    ],
  }],
};

// ── Turn a photo into a post ───────────────────────────────────────────────────

export const DEMO_PROMOTE_PHOTO = { url: '/demo/croissants.webp', fileName: 'stockpot-demo-croissants.webp', type: 'image/webp' };

export const DEMO_PROMOTE_NOTE = 'A photo of the demo kitchen’s croissants is ready. Press Use the demo photo to see it made into a post. In your own account, take or choose your own photo.';

export const DEMO_PROMOTE_READINGS: Record<PromoteLanguage, PromoteReading> = {
  en: {
    isFood: true, menuItemId: 'menu_croissant', dishName: 'Butter Croissant', focus: { x: 0.45, y: 0.62 },
    caption: 'Flaky, golden and baked this morning 🥐 Our butter croissants go fast, so message us and we’ll keep yours aside.',
    hashtags: ['#ButterCroissant', '#FreshlyBaked', '#HomeBakery', '#CroissantLove'],
  },
  hinglish: {
    isFood: true, menuItemId: 'menu_croissant', dishName: 'Butter Croissant', focus: { x: 0.45, y: 0.62 },
    caption: 'Subah ke fresh, flaky butter croissants 🥐 Jaldi khatam ho jaate hain, toh abhi message karo aur apna wala reserve karwa lo!',
    hashtags: ['#ButterCroissant', '#FreshlyBaked', '#HomeBakery', '#CroissantLove'],
  },
};

// ── Ask your business ──────────────────────────────────────────────────────────

export const DEMO_ASK_NOTE = 'Pick a question to see it answered from the demo kitchen’s own numbers. In your own account you can ask anything.';

export const DEMO_QUESTIONS = [
  'How much money did I make this month?',
  'Which item makes the most profit?',
  'Which customers should I get back in touch with?',
  'What’s running low?',
] as const;
export type DemoQuestion = (typeof DEMO_QUESTIONS)[number];

const figure = (built: BuiltSnapshot, id: string): number | null => {
  const f = built.registry.figures[id];
  return f && 'value' in f && typeof f.value === 'number' ? f.value : null;
};

/**
 * The answer to one of DEMO_QUESTIONS for the period the snapshot was built for, in the tokens the model writes
 * ({{fig:…}}, {{name:…}}, {{cust:…}}), so the app shows the numbers itself (utils/aiFigures). Null for any other question.
 */
export function demoAnswer(question: string, built: BuiltSnapshot): string | null {
  const s = built.promptSnapshot;
  switch (DEMO_QUESTIONS.find(q => squash(q) === squash(question))) {
    case 'How much money did I make this month?': {
      if ((figure(built, 'revenue_now') ?? 0) <= 0) return 'There were no sales in this period, so there is no profit to show yet.';
      return [
        `In this period you made {{fig:true_profit_now}} of true profit on {{fig:revenue_now}} of sales, from {{fig:orders_now}} orders.${s.figures.true_profit_margin ? ' That is {{fig:true_profit_margin}} of what you sold.' : ''}`,
        'True profit is what is left after ingredients, packaging, payment fees and your fixed costs: the money the kitchen actually kept.',
      ].join('\n\n');
    }
    case 'Which item makes the most profit?': {
      const ranked = [...s.products].sort((a, b) => (figure(built, b.contribution) ?? 0) - (figure(built, a.contribution) ?? 0));
      const [best, next] = ranked;
      if (!best) return 'Nothing was sold in this period yet, so no item has made money in it.';
      return [
        `{{name:${best.name}}} made you the most: {{fig:${best.contribution}}} from {{fig:${best.units}}} sold, or {{fig:${best.perUnit}}} on each.${next ? ` Next comes {{name:${next.name}}} with {{fig:${next.contribution}}}.` : ''}`,
        'That is what is left from each sale after its ingredients, packaging and payment fees.',
      ].join('\n\n');
    }
    case 'Which customers should I get back in touch with?': {
      const due = s.customers.dueList.slice(0, 3);
      const lapsed = s.customers.lapsedList.slice(0, 3);
      const line = (c: { label: string; daysSinceLastOrder: string; favourite?: string }) =>
        `- {{cust:${c.label}}}: last ordered {{fig:${c.daysSinceLastOrder}}} ago${c.favourite ? `, usually gets {{name:${c.favourite}}}` : ''}`;
      if (due.length > 0) return ['These customers are due for their next order:', due.map(line).join('\n'), 'A friendly WhatsApp with what is fresh today usually brings them back.'].join('\n\n');
      if (lapsed.length > 0) return ['No one is due right now, but these customers have not ordered in a while:', lapsed.map(line).join('\n'), 'A friendly WhatsApp with what is fresh today usually brings them back.'].join('\n\n');
      return 'Everyone has ordered recently: no one needs a nudge right now.';
    }
    case 'What’s running low?': {
      const soon = s.inventory.reorderSoon.slice(0, 3);
      const alsoLow = s.inventory.lowStock.filter(id => !soon.some(r => r.name === id)).slice(0, 3);
      const parts: string[] = [];
      if (soon.length > 0) {
        parts.push(['At the rate you are using them:', soon.map(r => `- {{name:${r.name}}} runs out in about {{fig:${r.daysOfCover}}}, around {{fig:${r.runOutDate}}}. {{fig:${r.suggestedQty}}} would cover the next week.`).join('\n')].join('\n\n'));
      }
      if (alsoLow.length > 0) parts.push(`Also below its alert level: ${alsoLow.map(id => `{{name:${id}}}`).join(', ')}.`);
      return parts.length > 0 ? parts.join('\n\n') : 'Nothing is running low at the rate you are using it.';
    }
    default:
      return null;
  }
}
