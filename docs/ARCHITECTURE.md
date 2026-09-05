# Architecture

This doc exists so the next person extending this app doesn't rebuild another
3,800-line `App.tsx`. It covers the pattern used to break the original
monolith apart, and where to put new code.

## The shape of it

```
src/
  App.tsx              Composes hooks, owns the shared Firestore listener,
                        renders the top-level layout and modals.
  firebase.ts           Firebase app/auth/Firestore init, re-exports the SDK
                        functions the rest of the app uses.
  hooks/                One hook per feature area. Own the write-side logic
                        (CRUD, Firestore writes) and, where self-contained,
                        their own UI state (e.g. modal inputs).
  views/                One component per tab (InventoryView, MenuView, ...).
                        Pure presentation — they receive everything via props
                        from App.tsx (see AppViewProps in types/index.ts).
  utils/                Small, dependency-light pure functions shared across
                        hooks (unit conversion, Firestore error handling,
                        ingredient deduction).
  types/index.ts        Shared TypeScript types and the AppViewProps contract
                        every view component receives.
```

## Why hooks, not a state manager

The original `App.tsx` had 78 `useState` calls and every handler function
inline in one component. Rather than introduce Redux/Zustand/Context on top
of an already-large refactor, each feature area was extracted into a custom
hook that:

- Takes read-only data it needs as parameters (e.g. `materials`, `menu`) —
  it does not own or duplicate that state.
- Owns and returns the state/handlers specific to its feature (e.g.
  `useInventoryActions` owns the Restock modal's own input state, since
  nothing else needs it).
- Is called once, near the top of `BakeryApp`, and its return value is
  spread into `appProps`, which every view receives as `{...appProps}`.

This keeps the "one big prop bag" pattern that was already there (rather than
forcing an unrelated rewrite of every view's props), while moving all the
*logic* out of `App.tsx` into independently readable, independently testable
files.

## Why some state stays in App.tsx

`materials`, `menu`, `orders`, `experiments`, `productionRuns`, `settings`,
and `wastageLogs` are all populated by **one combined Firestore `onSnapshot`
listener effect** in `App.tsx`, because they were originally built to share
a single subscribe/cleanup lifecycle. Hooks that need this data (e.g.
`useMenuActions` needs `materials` to validate recipe ingredients) take it as
a parameter rather than owning a duplicate copy.

This is the one piece of the original monolith that hasn't been split apart.
Splitting it is a reasonable next step, but touches the riskiest part of the
app (get it wrong and every tab's data stops updating), so it's being left
for a dedicated pass rather than done as a side effect of another change.

## Adding a new feature

1. If it's a new CRUD area (new Firestore collection, new set of actions),
   create `src/hooks/useYourFeatureActions.ts` following the pattern in e.g.
   `src/hooks/useMenuActions.ts`: accept the read-only data you need as
   parameters, return the actions.
2. Call the hook in `BakeryApp` (`App.tsx`), roughly where the older,
   already-extracted hooks are called, and spread its return value into
   `appProps`.
3. Add the new fields to `AppViewProps` in `src/types/index.ts`.
4. If a Firestore write can fail, use `handleFirestoreError` from
   `src/utils/firestoreError.ts` rather than a bespoke try/catch — it logs
   consistently and includes auth context in the error.
5. Write a test. See `src/hooks/__tests__/` and `src/utils/__tests__/` for
   the pattern: mock `../firebase` with `vi.mock`, then assert on what got
   written. Pure logic (no Firestore) doesn't need any mocking — see
   `src/utils/__tests__/conversions.test.ts`.

## A note on trust

Several bugs were found during the hook-extraction work where a feature's
logic existed and worked, but was never actually connected to a UI trigger,
or was connected to the wrong prop name. If something in this app doesn't
seem to work, check whether the handler function exists and is correct
before assuming the underlying logic is broken — there's a real chance it's
just not wired up. `git log` / `docs/CHANGELOG.md` has examples.
