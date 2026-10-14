/**
 * helpTopics.ts
 *
 * The help for Stockpot (the web app) and Stockpot Quick (the phone app): one list of topics, written for the owner of a
 * home bakery or food business, shown by the web's Help tab (views/HelpView) and the phone's Help screen
 * (mobile/src/app/help.tsx). Plain data with no imports, so the phone can bundle it too.
 *
 * Each topic says which app it is for. Words in **double stars** are the names of buttons and screens, drawn bold
 * (`helpSpans`). When a screen or button is renamed, change its name here too.
 */

export type HelpApp = 'web' | 'phone';

export type HelpSectionId = 'start' | 'stock' | 'recipes' | 'orders' | 'money' | 'production' | 'settings' | 'phone' | 'questions';

export const HELP_SECTIONS: { id: HelpSectionId; title: string }[] = [
  { id: 'start', title: 'Getting started' },
  { id: 'phone', title: 'Stockpot Quick on your phone' },
  { id: 'stock', title: 'Stock and materials' },
  { id: 'recipes', title: 'Recipes and menu' },
  { id: 'production', title: 'Production and wastage' },
  { id: 'orders', title: 'Orders, bills and payments' },
  { id: 'money', title: 'Profit and costs' },
  { id: 'settings', title: 'Settings and your account' },
  { id: 'questions', title: 'Common questions' },
];

/** A paragraph, numbered steps, or a list of points. */
export type HelpBlock =
  | { kind: 'text'; text: string }
  | { kind: 'steps'; items: string[] }
  | { kind: 'points'; items: string[] };

export interface HelpTopic {
  id: string;
  section: HelpSectionId;
  title: string;
  /** One line under the title in the list. */
  summary: string;
  apps: HelpApp[];
  /** Other words people may search with (Hindi and Hinglish included). */
  keywords: string[];
  body: HelpBlock[];
}

const text = (t: string): HelpBlock => ({ kind: 'text', text: t });
const steps = (...items: string[]): HelpBlock => ({ kind: 'steps', items });
const points = (...items: string[]): HelpBlock => ({ kind: 'points', items });

export const HELP_TOPICS: HelpTopic[] = [
  // ── Getting started ──────────────────────────────────────────────────────
  {
    id: 'first-steps', section: 'start', apps: ['web'],
    title: 'Setting up Stockpot',
    summary: 'The order to add things in, so costs and profit work from day one.',
    keywords: ['start', 'setup', 'begin', 'new', 'onboarding', 'how to use'],
    body: [
      text('Stockpot works out what each item costs you and what you really keep. It needs three things from you, in this order:'),
      steps(
        '**Your materials** (Stock / Inventory): flour, butter, boxes, ribbons. Each with what you paid for it.',
        '**Your recipes** (Recipes & Menus): each item you sell, what goes into one, and your selling price. You can read recipes from a photo instead of typing them.',
        '**What you make and sell**: log a **Production Run** when you bake, and add **Orders** as they come in. Stock goes down and up by itself.',
      ),
      text('Then fill in **Settings › Business Profile**: your business name, phone, UPI ID (so bills can be paid by UPI), GST if you charge it, and your fixed monthly costs such as rent.'),
      points(
        'Want to look around first? On the sign-in screen, **Explore Demo Sandbox** opens a sample bakery you can change freely.',
        'Everything you do on the website shows on Stockpot Quick on your phone, and the other way round, as long as you sign in with the same account.',
      ),
    ],
  },
  {
    id: 'trial-and-plan', section: 'start', apps: ['web', 'phone'],
    title: 'Free trial, plan and the demo kitchen',
    summary: 'What the trial includes, how to cancel, and what the demo is for.',
    keywords: ['trial', 'free', 'plan', 'subscription', 'price', 'pay', 'cancel', 'demo', 'sandbox'],
    body: [
      text('A new account starts with a 45-day free trial. Your plan is managed on the Stockpot website, in **Settings › User Account**: see when it renews, or cancel it.'),
      text('The **demo kitchen** (on the website: **Explore Demo Sandbox**; on the phone: **Try the demo kitchen**) is a sample bakery with made-up orders and stock. Try anything there; nothing you do touches a real account. The AI features (reading messages, recipes, voice) are not available in the demo.'),
    ],
  },

  // ── Phone app ────────────────────────────────────────────────────────────
  {
    id: 'phone-start', section: 'phone', apps: ['phone'],
    title: 'What Stockpot Quick does',
    summary: 'The phone app for the busy moments: orders, stock, payments, by voice.',
    keywords: ['phone', 'mobile', 'app', 'quick', 'today', 'android'],
    body: [
      text('Stockpot Quick is for the things you do with flour on your hands: taking an order, noting stock you bought, logging what you baked, recording a payment, and sending bills. Recipes, costs and reports stay on the website (**Settings › Open Stockpot on the web**).'),
      points(
        '**Today** shows what needs you now: orders due, payments pending, anything running low or near its use-by date, and today\'s takings. Pull down to refresh.',
        'The big **mic** button: say what happened, and Stockpot works out whether it is an order, stock bought, something made or a payment.',
        '**Upcoming** lists your pre-orders and everyone who owes you money.',
        '**Settings** has your notifications and this help.',
      ),
      text('Sign in with the same account as the website: everything you save shows on both.'),
    ],
  },
  {
    id: 'phone-voice', section: 'phone', apps: ['phone'],
    title: 'Saying or typing an order, stock, production or payment',
    summary: 'Speak naturally, check what was understood, then save.',
    keywords: ['voice', 'mic', 'speak', 'say', 'type', 'order', 'stock in', 'restock', 'production', 'payment', 'bolo', 'awaaz'],
    body: [
      steps(
        'On **Today**, tap the big **mic** (or **New order**, **Stock in**, **Production** or **Payment** to say which kind first).',
        'Say it as you would to a friend, in English or Hinglish. For example: "Priya, two chocolate truffle cakes for Saturday evening, five hundred advance on UPI", "Bought five kilo maida for four fifty", "Made forty croissants, three burnt", "Priya paid the remaining thirteen hundred by UPI".',
        'Tap the square to stop. The words appear in the box: fix anything misheard, then tap **Read it**.',
        'If something is missing (which cake? for when?), Stockpot asks, one question at a time.',
        'Check the summary and tap **Save**. Nothing is saved before that.',
      ),
      points(
        'You can type instead of speaking: tap the box and write it.',
        'Left before saving? Today offers **Pick up where you left off**.',
        'An order for a day after today is booked as a **pre-order**; stock is taken when you hand it over.',
        'Names of your customers are only sent to the speech service if you turn on **Settings › Recognise my customers**, which helps it spell them right.',
      ),
    ],
  },
  {
    id: 'phone-preorders', section: 'phone', apps: ['phone'],
    title: 'Pre-orders and handing over',
    summary: 'See what is booked, send confirmations, and hand orders over.',
    keywords: ['preorder', 'pre-order', 'upcoming', 'booked', 'hand over', 'delivery', 'pickup', 'advance', 'confirmation'],
    body: [
      text('**Upcoming › Pre-orders** lists every booked order, soonest first, with any that are overdue at the top.'),
      points(
        '**Send confirmation** opens WhatsApp with the order details for the customer.',
        '**Hand over** when the customer collects. The sheet shows the balance; turn on **Balance received now** only if they paid it then, and tap **Complete hand over**. The items come off your finished stock at this moment, so log your production first.',
        'Send the invoice from the card, or after handing over.',
      ),
    ],
  },
  {
    id: 'phone-payments', section: 'phone', apps: ['phone'],
    title: 'Getting paid: invoices, reminders and Mark as paid',
    summary: 'Who owes you, sending the bill, and recording payment.',
    keywords: ['payment', 'paid', 'unpaid', 'owe', 'due', 'invoice', 'bill', 'statement', 'reminder', 'upi', 'udhaar', 'paisa'],
    body: [
      text('**Upcoming › Payments due** lists everyone who owes you, largest first. Today\'s **To collect** card shows the top three; tap **See all** for the rest.'),
      steps(
        'Tap **Send invoice** (one order) or **Send statement** (several). WhatsApp opens straight to the customer when you have their number; otherwise choose where to share it. The bill has your UPI ID and a link to view it online.',
        'For two days the card says **Bill sent** and shows **Mark as paid**.',
        'When they pay, tap **Mark as paid** and choose **UPI**, **Cash** or **Card**. Paid a different amount? Tap **Paid a different amount?**.',
        'Still unpaid after two days? You get a reminder, and the button becomes **Send reminder**.',
      ),
      text('If a customer taps "I\'ve paid by UPI" on their bill, the card says so. Check your UPI app, then tap **Confirm received** or **Not received**.'),
    ],
  },
  {
    id: 'phone-notifications', section: 'phone', apps: ['phone'],
    title: 'Notifications',
    summary: 'A morning summary, low stock, use-by dates, tomorrow\'s orders and unpaid bills.',
    keywords: ['notification', 'alert', 'reminder', 'morning', 'summary', 'push'],
    body: [
      text('In **Settings**, tap **Turn on notifications** and allow them when the phone asks. Then choose which you want:'),
      points(
        '**Morning summary**, at the time you set: orders due, payments pending, anything low.',
        '**Running low**: once, when a material drops below its alert level.',
        '**Use by soon**: materials and baked batches within two days of their use-by date.',
        '**Due tomorrow**: an evening list of tomorrow\'s pre-orders.',
        '**Unpaid bills**: once, when a bill you sent is still unpaid two days later.',
      ),
      text('Times follow your business\'s time zone (website **Settings › Business Profile**). Turned them off in the phone\'s own settings? Tap **Open phone settings** in Stockpot Quick to turn them back on.'),
    ],
  },

  // ── Stock ────────────────────────────────────────────────────────────────
  {
    id: 'materials', section: 'stock', apps: ['web'],
    title: 'Adding your materials',
    summary: 'Ingredients and packaging, with what you paid, so recipes can be costed.',
    keywords: ['material', 'ingredient', 'inventory', 'stock', 'add item', 'packaging', 'csv', 'import', 'unit', 'kacha maal'],
    body: [
      steps(
        'Open **Stock / Inventory** and click **Add Item**.',
        'Give the name, the unit you keep it in (g, kg, ml, l or pieces), how much you have now, and the cost per unit.',
        'Set a **Threshold**: when stock drops to it, the material shows as low and you are told.',
        'Optional: its category (Raw Materials, Packaging…), the GST you pay on it, and the expiry date of what you have.',
      ),
      points(
        'Many at once? Click **Template** to download a spreadsheet, fill it in, then **Import CSV**.',
        'A recipe can use a different unit from the one you buy in (grams of flour you buy by the kg): Stockpot converts.',
        'Packaging (boxes, bags, labels) is a material too, so its cost counts.',
      ),
    ],
  },
  {
    id: 'restock', section: 'stock', apps: ['web', 'phone'],
    title: 'Recording stock you bought',
    summary: 'Restock a material; the price is averaged with what you had.',
    keywords: ['restock', 'buy', 'bought', 'purchase', 'stock in', 'price', 'kharida'],
    body: [
      text('On the website, click **Restock** on a material in **Stock / Inventory**. Enter how much you bought and the **total you paid**; Stockpot works out the cost per unit. On the phone, say it: "Bought five kilo maida for four fifty", or tap **Stock in** on Today.'),
      points(
        'The cost per unit becomes the average of what was on the shelf and what you just bought, so recipe costs follow your real prices.',
        'Every price you pay is kept: click **Price history** on a material to see how it has moved.',
        'Add the expiry date of the new batch if it has one.',
      ),
    ],
  },
  {
    id: 'low-stock', section: 'stock', apps: ['web'],
    title: 'Low stock and reorder suggestions',
    summary: 'What the status labels mean and how much to buy.',
    keywords: ['low', 'reorder', 'threshold', 'running out', 'status', 'alert', 'expiring'],
    body: [
      points(
        '**In Stock**: comfortably above its threshold.',
        '**Reorder Soon**: close to its threshold (within a quarter above it). Time to buy.',
        '**Low Stock**: at or below the threshold you set.',
        '**Expiring / Expired**: the current stock is near or past its expiry date.',
      ),
      text('**Reorder suggestions** works out how much to buy from what you have used recently. Treat it as a starting point: a suggestion marked **Low confidence** has little history behind it.'),
    ],
  },

  // ── Recipes and menu ─────────────────────────────────────────────────────
  {
    id: 'recipes', section: 'recipes', apps: ['web'],
    title: 'Adding a recipe and its price',
    summary: 'What goes into one item, its cost and margin, and a suggested price.',
    keywords: ['recipe', 'menu', 'item', 'cost', 'price', 'margin', 'selling price', 'add menu item', 'packaging'],
    body: [
      steps(
        'Open **Recipes & Menus** and click **Add Menu Item**.',
        'Name it and add each material with the amount for **one** item you sell (one cupcake, one 1 kg cake). Add the box and other packaging too.',
        'Enter the **Sale price**. The card shows the recipe cost and your margin as you type.',
        'Optional: **Shelf life (days)** (so baked batches show their use-by date), **Servings** (for nutrition), a menu category and a short description for the shared menu.',
      ),
      points(
        'Not sure what to charge? Set a **Target margin** and click **Suggest**.',
        '**Cost incomplete** means a material in the recipe has no price yet: restock it or add its price.',
        '**Duplicate Recipe** is quick for a variation (eggless, a bigger size).',
      ),
    ],
  },
  {
    id: 'made-items', section: 'recipes', apps: ['web', 'phone'],
    title: 'Bases, fillings and items made from other items',
    summary: 'A sponge base made ahead for cream cakes, a ganache, cookies in a hamper.',
    keywords: ['base', 'sponge', 'sub recipe', 'sub-recipe', 'filling', 'ganache', 'custard', 'premix', 'cake gel', 'hamper', 'combo', 'made ahead', 'intermediate', 'not for sale'],
    body: [
      text('If you make something ahead and use it in other items (a sponge base for cream cakes, a ganache, a masala base, cookies that go into hampers), add it as its own item and use it in the others. Its cost then flows into every item built on it.'),
      steps(
        'On the website, in **Recipes & Menus**, add the base as an item, with its recipe for **one** base. A batch that makes 4.5 bases? Set **One batch makes** to 4.5; if you typed the recipe for the whole batch, Stockpot offers to divide it (the recipe reader does both for you).',
        'Open its recipe and turn off **Sold on the menu**. It moves to **Made for other items**, and stays out of orders, the shared menu and margin figures.',
        'In each cream cake, click **Add a made item** and choose the base: 1 for a 1 kg cake, 0.5 for a half-kg cake.',
        'When you bake bases, log a **Production Run** for them in batches (2 batches is 9 bases), with what actually came out.',
        'Make the cream cakes when they are ordered? Turn on **Made when ordered** for them: each sale takes the base, cream and fruit by itself (see **Things you make when they are ordered**). Make them ahead instead? Log a run for the cakes: the bases come out of base stock, and the cream and fruit out of your materials.',
      ),
      points(
        'If there are not enough bases, Stockpot warns you but lets you go ahead. Log the bases you made, and the count comes right.',
        'When cake gel gets dearer, every cream cake shows it, named as cake gel, in **Items needing repricing**.',
        'Production spend counts each ingredient once: the cream cake run does not count the base again.',
        'A base that is used in other items cannot be deleted until you take it out of them.',
        'On the phone, say "Made 9 vanilla bases" or "Made 3 pineapple cakes" as for anything else.',
      ),
    ],
  },
  {
    id: 'made-to-order', section: 'recipes', apps: ['web', 'phone'],
    title: 'Things you make when they are ordered',
    summary: 'A cream cake on a base, a thali, a hamper: record it once, and each sale takes its ingredients.',
    keywords: ['made to order', 'made when ordered', 'custom', 'cake', 'thali', 'hamper', 'on order', 'assemble', 'no production', 'automatic', 'deduct', 'order banane par'],
    body: [
      text('Some things are only made once someone orders them: a pineapple cream cake on a base you baked earlier, a thali, a gift hamper. Record the recipe once and turn on **Made when ordered**. Every sale then takes exactly what it is made from, with no production run to log.'),
      steps(
        'On the website, in **Recipes & Menus**, add the item with its recipe for **one** (a 1 kg pineapple cake: 1 sponge base, 150 g cream, 100 g pineapple). A ½ kg cake is its own item.',
        'Open its recipe and turn on **Made when ordered**. If some are on the shelf, Stockpot asks before clearing them; cancel to sell those first.',
        'Add orders as usual. **Add Order** shows what each one takes ("1 Sponge base (5 there) · 150 ml cream"), and the order takes it when you save.',
        'For a pre-order, nothing is taken when it is booked: it is taken when you hand it over, when the cake is made.',
      ),
      points(
        'Short of a base or some cream? Stockpot warns you and still saves, as the cake is made: stock goes below nothing until you restock or log the bases.',
        'Deleting or changing an order gives back exactly what it took, even if the recipe has changed since.',
        'It is left out of **Log Production Run**, so its ingredients are never counted twice. To make some ahead for the shelf, turn the switch off for a while.',
        'Its cost, margin and repricing alerts work as for any item. The Dashboard shows what made-to-order sales used, beside production spend, and ingredients running out take these sales into account.',
        'On the phone, an order for it is taken the same way; it never stops for lack of finished stock.',
      ),
    ],
  },
  {
    id: 'read-recipe-web', section: 'recipes', apps: ['web'],
    title: 'Reading a recipe from a photo or text',
    summary: 'Add recipes from your notebook without typing every line.',
    keywords: ['read recipe', 'photo', 'picture', 'scan', 'ai', 'notebook', 'handwriting', 'import recipe'],
    body: [
      steps(
        'In **Recipes & Menus**, click **Read a recipe**.',
        'Add photos of the page (up to three, for a recipe that runs over) or paste the recipe.',
        'Check each recipe it found: every ingredient is matched to one of your materials and worked out for one item. Change a match if it is wrong.',
        'Answer anything marked: how much a cup of something weighs, how much a pinch of saffron is, whether whipped cream is sold or part of a cake.',
        'Click **Save**. New materials are added to your stock with no quantity.',
      ),
      points(
        'Written "makes 12"? Every amount is divided by 12, because recipes in Stockpot are for one item.',
        'You can read 15 recipes a day and 75 a month. A page with three recipes counts as three.',
        'Photos are read and then dropped, never kept.',
      ),
    ],
  },
  {
    id: 'read-recipe-phone', section: 'recipes', apps: ['phone'],
    title: 'Reading a recipe from a photo',
    summary: 'Photograph your notebook and add recipes to your menu.',
    keywords: ['read recipe', 'photo', 'camera', 'scan', 'ai', 'notebook', 'handwriting', 'import recipe'],
    body: [
      steps(
        'On **Today**, tap **Read a recipe from a photo** (scroll down if you do not see it).',
        'Tap **Take photo** (the phone asks for the camera the first time) or **Gallery**. Add up to three pages. Or choose **Type it**.',
        'Hold the phone straight over the page in good light, then tap **Read recipe**. It can take up to a minute.',
        'Check each card: tap an ingredient\'s material to change it. Answer anything marked in orange, or tap **Use … (typical)**.',
        'Tap **Save**. The recipes are on your menu, on the website too.',
      ),
      text('You can read 15 recipes a day and 75 a month; the screen says how many are left. Photos are not kept.'),
    ],
  },
  {
    id: 'repricing', section: 'recipes', apps: ['web'],
    title: 'When ingredient prices go up',
    summary: 'Items needing repricing, and trying a new price before you change it.',
    keywords: ['reprice', 'margin', 'drift', 'what if', 'price rise', 'mehenga', 'inflation'],
    body: [
      text('When what you pay for materials goes up, your margins shrink without you noticing. Stockpot watches for it:'),
      points(
        'An item whose margin has slipped below your target shows in **Items needing repricing** on the Dashboard, and under **Under 40% / unpriced** in Recipes & Menus.',
        'Click **What if…** to try a new price, or a change in an ingredient\'s price, and see the effect on margin and profit before changing anything.',
        'Your target margin and how big a slip to warn about are in **Settings › Business Profile › Pricing**.',
      ),
    ],
  },
  {
    id: 'share-menu', section: 'recipes', apps: ['web'],
    title: 'Sharing your menu and nutrition cards',
    summary: 'A menu picture for WhatsApp, and a nutrition and allergen card.',
    keywords: ['share menu', 'menu card', 'whatsapp', 'nutrition', 'allergen', 'calories'],
    body: [
      points(
        'In **Orders**, click **Share Menu**: a menu of every priced item, grouped by menu category, to download or send on WhatsApp.',
        'For nutrition, give each material its nutrition (**Nutrition & allergens** in Stock / Inventory) and each recipe its **Servings**. Then **Share Nutrition Card** on the recipe makes a card in your brand colour.',
        'Nutrition figures are estimates from your ingredients, not a lab test.',
      ),
    ],
  },

  // ── Production and wastage ───────────────────────────────────────────────
  {
    id: 'production', section: 'production', apps: ['web', 'phone'],
    title: 'Logging what you made',
    summary: 'A production run uses up ingredients and adds finished stock to sell.',
    keywords: ['production', 'bake', 'made', 'batch', 'yield', 'run', 'finished goods', 'banaya'],
    body: [
      text('Every time you bake, log it. Stockpot takes the ingredients out of your stock and adds what you made to your **finished stock**, which orders are then sold from.'),
      steps(
        'On the website, open **Production Runs** and click **Log Production Run**. On the phone, say "Made forty croissants, three burnt", or tap **Production**.',
        'Choose the item and how many you made. Add more items if you baked several things.',
        'If some were burnt or broken, or a batch went further, tap **Came out different?** and enter how many actually came out.',
        'Save. The batch shows with its cost and use-by date (from the recipe\'s shelf life).',
      ),
      points(
        'On the website, **Fill from a note** reads a message like "Made 40 croissants and 24 muffins, 3 croissants burnt" into the form.',
        'An order from stock can only sell what you have made. If it says **Not Enough Stock**, log the production first.',
        'Made in batches? See **Batches, and what actually came out**.',
      ),
    ],
  },
  {
    id: 'batches', section: 'production', apps: ['web', 'phone'],
    title: 'Batches, and what actually came out',
    summary: 'One mix makes about 4.5 cakes: log batches, and Stockpot keeps the real count and cost.',
    keywords: ['batch', 'batches', 'yield', 'makes', 'came out', 'got', 'short', 'extra', 'actual', 'lost in production', 'paneer', 'cookies', 'sponge', 'mix'],
    body: [
      text('For anything made in batches (sponge bases from a tub of cake gel, cookies by the tray, paneer from a pot of milk), tell Stockpot how many one batch makes and log production in batches.'),
      steps(
        'In **Recipes & Menus**, open the item and set **One batch makes** (4.5, 24, whatever it is). The recipe stays for **one** piece.',
        'When you make it, open **Log Production Run**: the item is counted in **Batches**. Enter 2, and Stockpot works out 9 pieces and takes that much from stock.',
        'Enter what **Actually made**, if it was different: 8 bases, not 9. Leave it empty if it came out as planned.',
      ),
      points(
        'Only what came out goes on the shelf. What did not is shown on the Dashboard as **Lost in production**, and taken off True profit (a batch that went further is **Gained in production**).',
        'The Production log shows each run\'s real cost per piece: a short batch makes each one dearer.',
        'After a few batches, the item says what they really made on average. Tap **Use 4.2** to make that the batch size: one batch keeps the same ingredients, so each piece now carries its true cost.',
        'Prefer pieces? Switch the row to **Pieces**. Quantities can have decimals (4.5).',
        'On the phone, say "Made 2 batches of sponge, got 8". The item needs its batch size set on the website first.',
      ),
    ],
  },
  {
    id: 'finished-stock', section: 'production', apps: ['web'],
    title: 'Finished stock and freshness',
    summary: 'What is left to sell, and batches near their use-by date.',
    keywords: ['freshness', 'expired', 'market stock', 'leftover', 'sampling', 'personal use', 'shelf life'],
    body: [
      text('**Production Runs › Market Stock & Freshness** shows what is left to sell from each batch. For each one you can:'),
      points(
        '**Add to an Order**: sell it now.',
        '**Mark as Personal Use** or **Mark as Sampling**: eaten at home or given away as samples, so it is no longer for sale.',
        '**Discard / log as wastage**: thrown away, with a reason.',
      ),
      text('Batches near or past their use-by date also show in the top bar as **Check freshness** or **Expired stock**.'),
    ],
  },
  {
    id: 'wastage', section: 'production', apps: ['web'],
    title: 'Wastage',
    summary: 'Recording what was thrown away, and seeing where losses come from.',
    keywords: ['waste', 'wastage', 'discard', 'thrown', 'loss', 'spoiled', 'expired', 'kharab'],
    body: [
      points(
        'Throw away a material: the **Log wasted/discarded stock** button on it in **Stock / Inventory**.',
        'Throw away baked items: **Discard / log as wastage** in **Production Runs**.',
        'The **Wastage** tab lists every loss with its cost, and **Loss by Reason** shows what causes most of it (expired, burnt, dropped…).',
      ),
      text('Wastage is a cost: it comes off your profit on the Dashboard.'),
    ],
  },
  {
    id: 'rnd', section: 'production', apps: ['web'],
    title: 'R&D Lab: testing new recipes',
    summary: 'Track what trials cost you.',
    keywords: ['r&d', 'experiment', 'trial', 'test', 'new recipe', 'lab'],
    body: [
      text('Trying out a new recipe uses real ingredients. In **R&D Lab**, click **New R&D Session**, name it, and add the materials you used. The stock shown for them goes down by what you used, and the cost shows as R&D on the Dashboard rather than hiding inside your other figures.'),
    ],
  },

  // ── Orders, bills and payments ───────────────────────────────────────────
  {
    id: 'orders', section: 'orders', apps: ['web'],
    title: 'Adding an order',
    summary: 'One item or several, from stock or booked ahead, paid or unpaid.',
    keywords: ['order', 'sale', 'sell', 'customer', 'add order', 'delivery', 'discount'],
    body: [
      steps(
        'Open **Orders** and click **Add Order**.',
        'Choose **From stock** (selling what you have made, or making it now if it is **Made when ordered**) or **Pre-order** (for a later day).',
        'Pick the item and quantity. **Add another item** for more.',
        'Add the customer\'s name and phone (Stockpot remembers customers and suggests them next time).',
        'Under **Payment**, choose **Paid now** or **Pay later**, and how they paid. Add a discount or delivery if there is one.',
        'Save.',
      ),
      points(
        '**Fill from a message**: paste the customer\'s WhatsApp message and Stockpot fills in the form for you to check.',
        'Delivery: choose self-delivery or a courier, what you charged the customer and what the courier cost you.',
      ),
    ],
  },
  {
    id: 'preorders', section: 'orders', apps: ['web'],
    title: 'Pre-orders, advances and handing over',
    summary: 'Booking ahead, taking an advance, and cancelling.',
    keywords: ['preorder', 'pre-order', 'advance', 'booking', 'cancel', 'refund', 'hand over', 'fulfil'],
    body: [
      points(
        'In **Add Order**, choose **Pre-order**, the day it is due and the time, and any **Advance received**. Stockpot offers to send the customer a confirmation on WhatsApp.',
        'Pre-orders show under **Booked ahead** in Orders, and on the Dashboard the day before. They count as sales on the day they are due, not the day you booked them.',
        'When the customer collects, click **Hand over**. That is when the items come out of your finished stock.',
        'Cancelled? Click **Cancel pre-order** and say whether the advance was **Refunded** or **Kept**. A kept advance counts as income.',
      ),
    ],
  },
  {
    id: 'bills', section: 'orders', apps: ['web', 'phone'],
    title: 'Bills and invoices',
    summary: 'A bill with your logo, a UPI QR code and a link to view it online.',
    keywords: ['bill', 'invoice', 'receipt', 'whatsapp', 'upi', 'qr', 'gst'],
    body: [
      text('On the website, click **Generate Bill** on an order: **Download** it as a picture, or **Send via WhatsApp**. On the phone, use **Send invoice** on the order or in Payments due.'),
      points(
        'With your UPI ID in Settings, the bill has a UPI QR code and a pay link for what is still owed.',
        'Every bill has a link the customer can open online, where they can also say they have paid by UPI, or pay by card if you set up online payments.',
        'GST is shown on the bill when it is turned on in Settings.',
      ),
    ],
  },
  {
    id: 'payments-web', section: 'orders', apps: ['web'],
    title: 'Unpaid orders and collecting payment',
    summary: 'Seeing who owes you and marking orders paid.',
    keywords: ['unpaid', 'pending', 'paid', 'payment', 'owe', 'collect', 'udhaar', 'consolidated'],
    body: [
      points(
        'An unpaid order shows an **Unpaid** tag in Orders. Click it to mark the order paid and say how.',
        '**Payments pending** lists everyone who owes you. **Consolidated bill** sends a customer one bill for all their unpaid orders; **Mark all paid** records them together.',
        'When a customer says on their bill that they paid by UPI, it shows here: check your UPI app, then **Confirm received** or **Not received**.',
      ),
    ],
  },
  {
    id: 'online-payments', section: 'orders', apps: ['web'],
    title: 'Letting customers pay by card or online',
    summary: 'Connect your own Razorpay or Cashfree account.',
    keywords: ['card', 'online', 'razorpay', 'cashfree', 'gateway', 'payment link'],
    body: [
      text('Customers can always pay your UPI ID from the bill. To also let them pay by card or netbanking, connect your own payment gateway: **Settings › Business Profile › Online payments**. Paste the keys from your Razorpay or Cashfree dashboard. The money goes straight to your account; Stockpot never holds it.'),
      text('When a customer pays this way, the order is marked paid by itself.'),
    ],
  },

  // ── Profit and costs ─────────────────────────────────────────────────────
  {
    id: 'true-profit', section: 'money', apps: ['web'],
    title: 'True profit, and how it is worked out',
    summary: 'What the Dashboard counts, from sales down to what you keep.',
    keywords: ['profit', 'dashboard', 'true profit', 'earnings', 'income', 'revenue', 'margin', 'munafa'],
    body: [
      text('The Dashboard\'s **True profit** is what the business kept after every cost. It starts from your sales and takes off, in order:'),
      points(
        'Ingredients and packaging of what you sold (at the prices when you sold it).',
        'Courier costs and wastage. (R&D trials are shown on their own, not taken off profit.)',
        'What batches came out short of (**Lost in production**), at what each piece was planned to cost.',
        'Payment fees (set what UPI, cards and others cost you in Settings).',
        'Fixed monthly costs such as rent and salaries, spread over the days shown, up to today.',
      ),
      text('Choose daily, weekly, monthly or your own dates at the top. Unpaid orders count as sales (you are owed the money). Pre-orders count on the day they are due.'),
    ],
  },
  {
    id: 'fixed-costs', section: 'money', apps: ['web'],
    title: 'Fixed costs and payment fees',
    summary: 'Rent, gas, salaries and card fees, so true profit is real.',
    keywords: ['fixed cost', 'rent', 'salary', 'gas', 'electricity', 'fee', 'overhead', 'kiraya'],
    body: [
      points(
        '**Settings › Business Profile › Fixed monthly costs**: click **Add a fixed cost**, name it and enter the monthly amount. Give **From** and **Until** dates if it only applies for a while.',
        '**Payment fees**: the percentage each way of being paid costs you (UPI is often free; cards are not).',
      ),
    ],
  },
  {
    id: 'gst', section: 'money', apps: ['web'],
    title: 'GST',
    summary: 'Turning GST on, and whether your prices include it.',
    keywords: ['gst', 'tax', 'inclusive', 'exclusive'],
    body: [
      points(
        'Turn on **GST Applicable** in **Settings › Business Profile** and enter your rate.',
        '**Inclusive** if your menu prices already include GST; **Exclusive** if GST is added on top.',
        'Give each material the GST you pay on it. The Dashboard then shows **GST Collected** and **GST Paid** for the period.',
      ),
      text('Stockpot keeps the figures; it does not file returns. Check with your accountant.'),
    ],
  },
  {
    id: 'ai', section: 'money', apps: ['web'],
    title: 'Yesterday\'s briefing and Ask your business',
    summary: 'A short daily summary, and questions about your figures.',
    keywords: ['ai', 'briefing', 'ask', 'question', 'chat', 'assistant', 'summary'],
    body: [
      points(
        '**Yesterday\'s briefing** on the Dashboard sums up yesterday in a few lines: sales, true profit, what needs attention.',
        '**Ask your business** (the button at the bottom right) answers questions like "Which cake makes me the most money?" or "What if butter goes up 10%?".',
        'Every figure comes from your own data, worked out by Stockpot; the AI only writes the words.',
      ),
      text('These are available on accounts where AI is switched on, and not in the demo.'),
    ],
  },

  // ── Settings ─────────────────────────────────────────────────────────────
  {
    id: 'business-profile', section: 'settings', apps: ['web'],
    title: 'Your business details, logo and colour',
    summary: 'What appears on bills, and how the app looks.',
    keywords: ['settings', 'business', 'name', 'logo', 'colour', 'color', 'brand', 'upi id', 'time zone', 'address'],
    body: [
      points(
        '**Settings › Business Profile**: business name, phone, UPI ID, address and time zone. These go on your bills.',
        '**Settings › App Customisation**: upload your logo and choose your brand colour. The colour shows straight away; press **Save Changes** at the top to keep it.',
        '**Settings › Inventory Categories**: the groups your materials are sorted into.',
      ),
    ],
  },
  {
    id: 'integrations', section: 'settings', apps: ['web'],
    title: 'Shopify and Odoo',
    summary: 'Bring in orders from your online store.',
    keywords: ['shopify', 'odoo', 'integration', 'online store', 'website orders', 'sync'],
    body: [
      text('**Settings › Integrations** connects a Shopify or Odoo store, so its orders come into Stockpot and are matched to your menu items. Follow the steps shown there; Shopify needs an app set up in your Shopify admin first.'),
    ],
  },

  // ── Common questions ─────────────────────────────────────────────────────
  {
    id: 'q-phone-web', section: 'questions', apps: ['web', 'phone'],
    title: 'Do the phone and the website share my data?',
    summary: 'Yes, when you sign in with the same account.',
    keywords: ['sync', 'same', 'phone', 'website', 'account', 'missing', 'not showing'],
    body: [
      text('Yes. Stockpot Quick and the website use the same account: an order saved on the phone shows on the website straight away, and a recipe added on the website is used by the phone. If something seems missing, check you signed in with the same email or Google account on both, then pull down to refresh on the phone.'),
    ],
  },
  {
    id: 'q-not-enough-stock', section: 'questions', apps: ['web', 'phone'],
    title: 'It says "Not Enough Stock"',
    summary: 'Orders are sold from what you have logged as made.',
    keywords: ['not enough stock', 'stock error', 'cannot save order', 'insufficient'],
    body: [
      text('An order from stock can only sell what you have made. Log a production run for the item first (website: **Production Runs**; phone: **Production**), then add the order. For an order for a later day, book a **pre-order** instead: its stock is only needed when you hand it over.'),
    ],
  },
  {
    id: 'q-cost-wrong', section: 'questions', apps: ['web'],
    title: 'An item\'s cost or profit looks wrong',
    summary: 'The usual causes, and where to look.',
    keywords: ['wrong', 'cost', 'profit', 'incorrect', 'too high', 'too low', 'margin'],
    body: [
      points(
        'Check the recipe amounts are for **one** item, not the whole batch.',
        'Check the unit: 200 g of a material bought by the kg is 0.2 kg, not 200 kg. Stockpot converts, but only if the unit chosen is right.',
        'A material with no price makes the item **Cost incomplete**.',
        'A material\'s cost is the average of what you paid. One wrong restock total can push it up: check **Price history**.',
        'Old orders keep the costs from the day they were sold, so changing a price today does not rewrite past profit.',
      ),
    ],
  },
  {
    id: 'q-ai-unavailable', section: 'questions', apps: ['web', 'phone'],
    title: 'An AI feature is missing or says it is not available',
    summary: 'Voice reading, recipe reading, the briefing and Ask your business.',
    keywords: ['ai', 'not available', 'missing', 'limit', 'voice', 'read recipe', 'briefing'],
    body: [
      points(
        'They are not available in the demo kitchen.',
        'They need an active plan or trial.',
        'Each has a daily limit (recipes: 15 a day and 75 a month). The limit resets the next day.',
        'If a reading comes back wrong, change it before saving: nothing is saved until you check it.',
      ),
    ],
  },
];

/** The topics for one app, in section order. */
export function helpTopicsFor(app: HelpApp): HelpTopic[] {
  const order = new Map(HELP_SECTIONS.map((s, i) => [s.id, i]));
  return HELP_TOPICS.filter(t => t.apps.includes(app)).sort((a, b) => order.get(a.section)! - order.get(b.section)!);
}

/** The sections that have topics for this app, each with its topics. */
export function helpSectionsFor(app: HelpApp): { id: HelpSectionId; title: string; topics: HelpTopic[] }[] {
  const topics = helpTopicsFor(app);
  return HELP_SECTIONS.map(s => ({ ...s, topics: topics.filter(t => t.section === s.id) })).filter(s => s.topics.length > 0);
}

const plain = (s: string) => s.toLowerCase().replace(/\*\*/g, '').replace(/[^a-z0-9&\s-]/g, ' ');

/** All the words of a topic, for searching. */
function haystack(t: HelpTopic): { title: string; rest: string } {
  const body = t.body.map(b => (b.kind === 'text' ? b.text : b.items.join(' '))).join(' ');
  return { title: plain(t.title), rest: plain(`${t.summary} ${t.keywords.join(' ')} ${body}`) };
}

function rank(topics: HelpTopic[], query: string, prefer?: HelpApp): HelpTopic[] {
  const words = plain(query).split(/\s+/).filter(w => w.length > 1);
  if (words.length === 0) return [];
  return topics
    .map(t => {
      const h = haystack(t);
      let score = 0;
      for (const w of words) {
        if (h.title.includes(w)) score += 3;
        else if (h.rest.includes(w)) score += 1;
        else return null;
      }
      // Between equal matches, a topic for the app being used comes first.
      if (prefer && t.apps.includes(prefer)) score += 0.5;
      return { t, score };
    })
    .filter((x): x is { t: HelpTopic; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)
    .map(x => x.t);
}

/**
 * Topics for this app matching every word of `query`, best first: a word in the title counts most, then in the summary,
 * keywords or text. An empty query gives nothing (the screen shows the sections instead).
 */
export const searchHelp = (query: string, app: HelpApp): HelpTopic[] => rank(helpTopicsFor(app), query);

/** Every topic, for either app, matching `query`, best first; topics for `prefer` (the app being used) win a tie. */
export const searchAllHelp = (query: string, prefer: HelpApp): HelpTopic[] => rank(HELP_TOPICS, query, prefer);

/** "Click **Save** now" as [{ text: 'Click ', bold: false }, { text: 'Save', bold: true }, { text: ' now', bold: false }]. */
export function helpSpans(s: string): { text: string; bold: boolean }[] {
  return s.split('**').map((part, i) => ({ text: part, bold: i % 2 === 1 })).filter(p => p.text !== '');
}
