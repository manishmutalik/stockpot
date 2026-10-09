# WhatsApp order reading: upgrade to read screenshots

**Status: idea, documented only. Not started.** Parked until there is user feedback on the existing typed and spoken
order reading (owner decision, 2026-10-09). Nothing in this file is built.

## The idea

Today the owner types or says an order and Stockpot Quick reads it (`POST /api/mobile/parse`, `lib/quickParseRoutes.ts`):
a model proposes a draft, the server checks it against the menu, asks about anything unclear, and the owner confirms.

The upgrade lets the owner **share a screenshot of a WhatsApp chat** into Stockpot Quick. Stockpot reads the order
lines and who sent them, and adds the order the same way a typed one is added. The name comes from the chat header; if
the contact is not saved, WhatsApp shows the number, and the order is kept under that number.

## How it would work

1. **Getting the image in (phone).** Share → Stockpot Quick from WhatsApp or the gallery, and an "Add from screenshot"
   choice inside the app. The image is shrunk on the phone before upload. First version: one screenshot; later, up to
   three read as one order (a long chat does not fit on one screen).
2. **Reading it (server).** A new input to the same parse route (or a sibling route) that sends the image to the model
   and returns the same reading as for text, plus the customer's name or number.
   - Customer name or number is taken only from the chat header, never from names or numbers inside messages.
   - Relative dates ("Saturday", "tomorrow") are worked out from the message timestamps on screen, and the date is
     always put to the owner as a question to confirm.
3. **Checking it (unchanged).** Items are matched against the menu by the existing validators; anything unclear
   becomes a question, never a guess. Nothing is saved until the owner confirms. Saving, idempotency keys, previews
   and the saved summary are the existing ones.
4. **Customer match.** A number that matches an existing customer fills in their name. An unknown number is saved as
   the customer's phone with no name, to be named later.

## Costs and limits to design for

- **Reading allowance.** An image read costs more than a text read. Count it against the daily limit
  (`AI_QUICK_DAILY_LIMIT`, 60 a day) and decide whether one screenshot counts as more than one reading.
- **Privacy.** The screenshot goes to the AI provider. Keep only the resulting draft, never the image. The privacy
  policy needs a line for this (owner reviews; legal text is not edited by Claude).
- **Weak spots to test on real chats first:** voice notes, edited or quoted messages, "same as last time", Hindi or
  Hinglish text, and screenshots that cut off the header (no name or number visible, so ask the owner).
- **Request size.** `express.json()` is the default size limit; images need a bigger limit on this route only, or
  an upload route. Decide when building.
- **New APK.** The share target is a native change, so the phone app needs a new build. The web app could also take a
  screenshot upload with no native change, as a first step.

## Rough size

One server route or input, an image step for the order reader reusing the order validator, share and pick-image
screens on the phone, tests. About the size of the Payments due feature.

## Decide before building

- One screenshot, or up to three?
- Phone app only, or the web app's Add Order as well?
- How an unnamed number is shown and later named.
- How many readings a screenshot costs.
- Whether user feedback on the typed and spoken flow suggests WhatsApp is where orders really arrive.
