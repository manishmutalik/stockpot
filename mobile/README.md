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

The server sends the notifications (see the main README, "Phone app notifications"); the app only hands it a token. Any APK
made with `expo prebuild` can receive them (only Expo Go cannot). Set up, once:

1. **Firebase file.** Firebase console, Project settings, Your apps, the Android app `com.stockpot.quick` (the one made for
   Google sign-in), download `google-services.json` into this `mobile` folder. It is ignored by Git, and `app.config.js` points
   the Android build at it when it is there.
2. **An Expo project, for its id.** On expo.dev (a free account), create a project named `stockpot-quick` and copy its ID
   into `mobile/.env` as `EXPO_PUBLIC_EAS_PROJECT_ID=<id>`. Without it the Settings screen says notifications are "not set up
   in this build yet". (`npx eas-cli init` also works and writes the id into `app.json` instead.)
3. **Give Expo's push service a key for Firebase.** Firebase console, Project settings, Service accounts, Generate new private
   key (a `.json` file; keep it private and never commit it). Then on expo.dev, your project, Credentials, Android, add the
   application identifier `com.stockpot.quick` and upload that file as the "FCM V1 service account key".
4. **Rebuild the APK** (steps below). The id and the file are read while the app is built.
5. **The server:** set `NOTIFICATIONS_CRON_SECRET` on Render and add the Render Cron Job (main README, "Phone app
   notifications"). If Expo's "enhanced push security" is on, also set `EXPO_ACCESS_TOKEN` on the server.
6. **iOS later:** an Apple Developer account; EAS creates the push key.

The app asks for permission only when the owner taps "Turn on notifications" in Settings, never at launch. It registers the
phone for whoever is signed in and switches it off on sign-out.

## Sign in with Google (Android)

"Continue with Google" on the sign-in screen opens the phone's own Google account sheet and signs in to Firebase with the
result, so it is the same account and the same kitchen as signing in with that Google account on the website (a Google
account never used with Stockpot makes a new, empty account, as it does on the web). The button only shows when
`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is set. Android only for now; iOS needs its own client ID and URL scheme.

Set it up once:
1. Firebase console, Authentication, Sign-in method: Google must be enabled (the website already uses it). Open it, and copy
   the **Web client ID** (ends `.apps.googleusercontent.com`). Put it in `mobile/.env`:
   `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<that id>`.
2. Find the **SHA-1** of the key the APK is signed with. After `npx expo prebuild --platform android`, in the `android`
   folder run `gradlew.bat signingReport` (Windows) or `./gradlew signingReport` and copy the `SHA1` shown for the `debug`
   variant (the release build we make for testing is signed with the debug key).
3. Firebase console, Project settings, Your apps, Add app, Android: package name `com.stockpot.quick` and that SHA-1.
   Skip downloading `google-services.json` (the app does not use it). This registers the app with Google; it can take a few
   minutes to start working. Add the SHA-1 of any other key the app is signed with later (a Play Store release key, say).
4. Build the APK again (the library is native code, so the new button needs a new build).

If Google's sheet says the sign-in is "not set up for this build", the SHA-1 or package name in step 3 does not match the
key that signed the APK.

## Speaking an entry (Android)

The mic on Today opens the capture screen already listening, and the round mic on the capture screen starts and stops it.
The words appear in the text box as they are heard (English as spoken in India, `en-IN`); the owner checks them, fixes
anything, and taps Read it, so nothing is read by the server (or counted against the daily limit) unseen. Leaving the screen
stops the microphone. It uses the phone's own speech recognition through `expo-speech-recognition`: on Android that is
Google's, which sends the audio to Google unless the phone has the language downloaded for offline use, so the privacy policy
should say so. It needs the Google app (or "Speech Recognition & Synthesis") installed and enabled; if it is missing, or the
microphone is refused, the screen says so and typing still works. A new APK is needed (it is native code and adds the
microphone permission); the demo kitchen shows "not available in the demo" for the mic, as for typing.

To hear the owner's own words, the capture screen asks the server (`GET /api/mobile/speech-phrases`) for the menu items
(as they are spoken, without the weight in brackets, and as written) and the materials, and gives them to the recogniser as
hints. They are kept for ten minutes and emptied on sign-out; if they cannot be fetched voice just listens without them. On
Android the hints only take effect on Android 13 and later. Customers' names are a separate switch in Settings (Voice),
off by default, because the hints go to the speech service along with the audio.

Not done yet: Hindi (Hindi speech comes back in Devanagari, and the checks that every unit and name was written in the
message expect Latin script, so it needs server work first).

## Build an APK on your own computer (Android, Windows)

For trying the app on a phone without Expo's cloud build. Needs Android Studio (for the SDK and its bundled Java),
Node 20+ and Git. Use one Command Prompt window for all of it, because the variables below last only for that window.

```
set ANDROID_HOME=C:\Users\<you>\AppData\Local\Android\Sdk
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
set GRADLE_USER_HOME=D:\gradle-home
cd /d C:\
git clone https://github.com/manishmutalik/stockpot.git sp
cd sp\mobile
npm install
echo EXPO_PUBLIC_API_URL=https://your-server.example.com>.env
npx expo prebuild --platform android
cd android
gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a --max-workers=2 -Dorg.gradle.jvmargs="-Xmx1536m -XX:MaxMetaspaceSize=512m"
```

The APK is `android\app\build\outputs\apk\release\app-release.apk`; copy it to the phone and open it (allow installs from
that app when asked). It is signed with a debug key, which is fine for testing and not for the Play Store. The `android`
folder is generated and ignored by Git.

What has gone wrong, and the fix:
- `%ANDROID_HOME%` prints as itself: the variable is not set in that window (set it there, or open a new window after saving it).
- Gradle times out downloading itself: a firewall or proxy that Java cannot get through. Try a phone hotspot, or download the
  `gradle-9.3.1-bin.zip` in a browser and point `distributionUrl` in `android\gradle\wrapper\gradle-wrapper.properties` at the file.
- "not enough space on the disk" while installing the NDK: the SDK is on C:, which needs about 10 GB free. Then delete the
  half-installed `Sdk\ndk\<version>` folder (an NDK folder with no `source.properties` is refused) and build again.
- "Gradle build daemon disappeared" with `Out of Memory` in the `hs_err_pid` log: the machine ran out of memory. Close other
  programs, give Windows a larger page file, and keep the `arm64-v8a` and `--max-workers=2` flags (the default builds four chip types).
- `sdkmanager --licenses` printing that it is deprecated is only a notice.

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
