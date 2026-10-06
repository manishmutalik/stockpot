# Stockpot Quick (phone app)

The owner says or types what happened ("Priya paid the remaining thirteen hundred by UPI"); the app reads it, asks what
is unclear, shows what it will save, and saves it to the same account as the web app. One Expo / React Native app for
Android and iOS. The spec and decisions are in `docs/handoffs/stockpot-quick-mobile.md`.

The app never works out money and never touches Firestore: everything goes through the Stockpot server's
`/api/mobile/*` endpoints, and Firebase is used only for signing in. The shapes the server answers with are in
`../src/utils/quickApiTypes.ts` (types only, imported by both sides).

## Run it

```bash
cd mobile
npm install
cp .env.example .env        # set EXPO_PUBLIC_API_URL to your Stockpot server
npx expo start              # then open it in Expo Go, or press a / i for an emulator
```

Expo Go is enough for sign-in and the Today screen. Voice reading and push notifications use native modules, so from
that step on the app needs a development build (`npx expo run:android`, or `eas build --profile development`).

## Checks

```bash
npx tsc --noEmit                       # types
npx expo export --platform android     # does it bundle?
```

The app's unit tests (`src/lib/__tests__`) run with the main project's tests (`npm test` at the repo root).

## Layout

- `src/app/` the screens (Expo Router): `sign-in`, and the tabs `(tabs)/index` (Today), `upcoming`, `settings`.
- `src/lib/` plain logic with no React Native in it, so it is unit tested: the API client, error messages.
- `src/auth/` who is signed in, and the API client that speaks as them.
- `src/theme/` colours, fonts and spacing from the Stitch design system.
- `bakery-mobile/` at the repo root is an older, unused prototype; it is left alone and goes once this app ships.
