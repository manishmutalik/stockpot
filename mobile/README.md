# Stockpot Quick (phone app)

The owner says or types what happened ("Priya paid the remaining thirteen hundred by UPI"); the app reads it, asks what
is unclear, shows what it will save, and saves it to the same account as the web app. One Expo / React Native app for
Android and iOS. The spec and decisions are in `docs/handoffs/stockpot-quick-mobile.md`.

The app never works out money and never touches Firestore: everything goes through the Stockpot server's
`/api/mobile/*` endpoints, and Firebase is used only for signing in. The shapes the server answers with are in
`../src/utils/quickApiTypes.ts` (types only, imported by both sides). The one piece of server code the app runs is `../src/utils/money.ts` (how an amount is written), shared so the phone and the server's own labels match; `metro.config.js` lets Metro read that folder, so keep what the app imports from it free of other imports.

## Run it

```bash
cd mobile
npm install
cp .env.example .env        # set EXPO_PUBLIC_API_URL to your Stockpot server
npx expo start              # then open it in Expo Go, or press a / i for an emulator
```

Expo Go is enough for sign-in and the Today screen. Voice reading and push notifications use native modules, so from
that step on the app needs a development build (`npx expo run:android`, or `eas build --profile development`).

## Notifications (what you set up once)

The server sends the notifications (see the main README, "Phone app notifications"); the app only needs to hand it a token.

1. **A development build** (`eas build --profile development`): push notifications do not work in Expo Go.
2. **An EAS project id.** Run `npx eas-cli@latest init` in this folder once; it writes `extra.eas.projectId` into `app.json`. Without it the Settings screen says notifications are "not set up in this build yet".
3. **Android only: Firebase Cloud Messaging.** Add a Firebase Android app for `com.stockpot.quick`, download its `google-services.json`, and upload the FCM credentials with `eas credentials` (see Expo's "Push notifications setup").
4. **iOS later:** an Apple Developer account; EAS creates the push key.
5. If Expo's "enhanced push security" is on, set `EXPO_ACCESS_TOKEN` on the server.

The app asks for permission only when the owner taps "Turn on notifications" in Settings, never at launch. It registers the phone for whoever is signed in and switches it off on sign-out.

## Checks

```bash
npx tsc --noEmit                       # types
npx expo export --platform android     # does it bundle?
```

The app's unit tests (`src/lib/__tests__`, plain logic with no React Native) run with `npm test` in this folder, using the
main project's vitest (run `npm install` at the repo root first). They are not part of the root `npm test`.

## Layout

- `src/app/` the screens (Expo Router): `sign-in`, `capture` (write, questions, confirm, saved), and the tabs `(tabs)/index` (Today), `upcoming` (pre-orders and the hand-over sheet), `settings` (account, notification choices, sign out).
- `src/lib/` plain logic with no React Native in it, so it is unit tested: the API client, the capture flow reducer (`capture.ts`), the saved summary, the unsaved-draft store. `useCapture.ts` is the one hook that runs it against the server.
- `src/auth/` who is signed in, and the API client that speaks as them.
- `src/theme/` colours, fonts and spacing from the Stitch design system.
- `bakery-mobile/` at the repo root is an older, unused prototype; it is left alone and goes once this app ships.
