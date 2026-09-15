# DGH FPL Manager 3.2.0 — x402-fpl-api Integration Notes

## What this release is

3.2.0 ports the remaining capability gaps identified in the 3.1.0 audit
against `x402-fpl-api-main` (see `lib/analytics/PORT_NOTES.md`) — five
signals that existed in the x402 source material but nowhere in DGH:

| Module | Ported from | Status |
|---|---|---|
| `lib/analytics/captainAlt.ts` | `app/algorithms/captain.py` | New — second opinion, doesn't replace `projection.ts` |
| `lib/analytics/multiGwHorizon.ts` | `app/algorithms/transfers.py` (`_player_value_score`) | New — supplementary 3-GW outlook, doesn't replace `transferEngine.ts` |
| `lib/analytics/priceIntel.ts` | `app/algorithms/prices.py` | Net new |
| `lib/analytics/newsIntel.ts` | `app/algorithms/news.py` | Net new |
| `lib/analytics/rivalIntel.ts` | `app/algorithms/rivals.py` | Net new |
| `lib/spyService.ts` | Built from scratch on the four modules above | Net new — the "DGH Spy" feature |

Every port is **additive**. Nothing in the existing 3.1.0 engine
(`transferEngine.ts`, `xiOptimizer.ts`, `projection.ts`, `chipOptimizer.ts`,
`chips.ts`, `recommendChipTiming.ts`, `dgwIntel.ts`, chip-timing UI, etc.) was
modified in scoring logic, and all of it is covered by
`scripts/engine-invariants.js`, which still passes unchanged.

## Where it's wired in

- **New tab**: `app/(tabs)/spy.tsx` ("DGH Spy") — price movers, news/injury
  alerts across my squad and rivals' squads, and rival transfer predictions
  for the closest 3 rivals by points gap. Registered as a hidden route
  (`href: null`, matching the pattern used for `rivals`/`squad`/`chips`/etc.)
  in `app/(tabs)/_layout.tsx`, reachable via the More tab's quick-access
  strip and the League tab's "Market movers →" link.
- **`lib/dataService.ts`**: `loadWarRoomData` now computes `spy: SpyIntel`
  via `buildSpyIntel(...)`, wrapped in its own try/catch — a Spy failure
  (e.g. a rival's `/transfers/` endpoint erroring) falls back to
  `emptySpyIntel()` and never blocks the rest of war room data.
- **`app/(tabs)/squad.tsx`**: adds a "Second opinion (x402-ported model)"
  panel below the existing captain UI, ranking the top 3 alt-captain
  candidates. Explicitly labelled as a second opinion, not a replacement.
- **`app/(tabs)/transfers.tsx`**: each proposed transfer move now shows a
  "DGH Spy on this move" block — 3-GW outlook delta, price-riser/faller
  flags, and outgoing-player news, alongside the existing next-GW
  transferEngine.ts recommendation (unchanged).
- **`app/(tabs)/league.tsx`**: a "Market movers" strip surfaces the top 3
  price risers with a link into the DGH Spy tab.
- **`app/rival/[id].tsx`**: adds a "DGH Spy" section per rival — squad
  weaknesses (`findRivalWeaknesses`) and, for the closest 3 rivals, the
  full transfer-out/in prediction with recent transfer history.
- **`lib/analytics/index.ts`**: re-exports all five new modules alongside
  the existing analytics surface.

## Version

- `package.json`: `3.1.0` → `3.2.0`
- `app.config.ts`: `version: "3.2.0"`, `versionCode: 320` (was 310)
- `scripts/release-preflight.js`: the hardcoded `2.5.0` version check (which
  was already stale against DGH's own 3.1.0 release before this pass) was
  replaced with a check that cross-references `package.json`'s version
  against `app.config.ts`'s `version`/`versionCode`, and asserts
  `versionCode` only ever increases from the last shipped value (310). This
  is a permanent fix, not a one-off bump — it won't need editing on the
  next version change.
- `theme/colors.ts`: `ThemeColors` was pinned to `typeof colors.dark`'s
  exact string literals, which meant `colors.light` (different literal
  values, same shape) couldn't satisfy the type. Widened to
  `{ [K in keyof typeof colors.dark]: string }` so either palette
  type-checks. This was a preexisting type-strictness bug, not something
  introduced by the Spy feature; it surfaced because `_layout.tsx` and
  `spy.tsx` are the first screens to read `theme.muted`/`theme.foreground`
  through both palettes in ways that made the literal-type mismatch matter
  under `tsc --noEmit`.
- `app.config.ts`: `edgeToEdgeEnabled` — an earlier pass in this
  integration had cast this through with `false as unknown as true` to
  dodge Expo SDK 54's literal-`true` type. That was a bad release config:
  Android 15+/16 makes edge-to-edge mandatory regardless of this flag, the
  property is deprecated and disappears entirely in SDK 55, and — per
  `template.json`, the project's own original scaffold — `true` was
  always the intended value; `false` was never a real product decision.
  Fixed to `edgeToEdgeEnabled: true` with no cast. The app already renders
  through `SafeAreaProvider`/`useSafeAreaInsets()` everywhere (`Page` in
  `Premium.tsx`, the tab bar in `(tabs)/_layout.tsx`), so this doesn't
  change any layout — it just stops shipping a config value the OS was
  already overriding.
- **Lockfile / package manager mismatch (build-blocking, fixed):**
  `package.json` pins `"packageManager": "pnpm@9.12.0"`, but earlier
  installs in this integration used `npm`, leaving a stale
  `package-lock.json` (still reporting version 3.1.0) and no
  `pnpm-lock.yaml`. EAS selects its package manager from whichever
  lockfile is present, and Expo's own docs require `pnpm-lock.yaml` for
  pnpm-based builds — an `npm` lockfile next to a `pnpm` `packageManager`
  field is exactly the mismatch that causes EAS to pick the wrong
  installer or fail the build. Fixed: `package-lock.json` deleted,
  `pnpm-lock.yaml` regenerated from the current 3.2.0 `package.json` using
  pnpm 9.12.0 (matching the pinned `packageManager` version exactly), and
  the full check suite (`tsc`, source validation, engine invariants,
  release preflight, vitest, lint) re-run end-to-end through `pnpm exec`
  against a `pnpm install` of that lockfile — all pass with 0 errors.

## New types (`lib/types.ts`)

`PriceDirection`, `PricePrediction`, `NewsSeverity`, `NewsAlert`,
`RivalTransferOutCandidate`, `RivalTransferInCandidate`,
`RivalTransferHistoryEntry`, `RivalPrediction`, `SpyIntel`. All additive —
no existing type in `lib/types.ts` was changed or narrowed.

## Testing

`tests/spy.test.ts` (24 tests, new) covers:
- `priceIntel`: rise/fall classification, confidence capping at 100%,
  exclusion of injured/doubtful/suspended players, zero-net-movement
  skipping, topN + sort order.
- `newsIntel`: keyword matching, penalty scoring (unknown-return worse than
  other negative news), age formatting buckets, alert dedup + severity
  ordering.
- `rivalIntel`: fixture-run lookup, transfer-out urgency (injury/form/
  blank-GW/tough-fixture), transfer-in filtering (excludes owned/injured/
  low-form/blank-GW), and weakness detection (both the "strong squad" and
  "multiple weaknesses" paths).
- `multiGwHorizon`: descending GW weighting (1.0/0.5/0.3), unavailable-status
  and news penalties, one-entry-per-player map building.
- `captainAlt`: home/low-FDR fixture bonus, blank-GW zeroing, the
  chanceNextRound-null injury-penalty edge case, and topN ranking.
- `spyService`: `emptySpyIntel()` shape, and `buildSpyIntel()` end-to-end
  with a mocked `fplClient` — including the never-blocks-on-a-failing-
  rival-transfers-fetch path, which is the behavior `dataService.ts`'s own
  try/catch depends on holding.

`tests/logic.test.ts` (10 tests, pre-existing 3.1.0 suite) is unmodified
and still passes — nothing in the ported chip-timing / DGH scoring /
transfer-planning logic was touched.

`package.json`'s `test:logic` script (used by `npm run validate` and
`npm run release:check`) now runs both `tests/logic.test.ts` and
`tests/spy.test.ts`. `tests/expo-token.test.ts` remains excluded, as it's
deliberately network- and credential-dependent (see its own header comment)
and was excluded from this suite before this pass, not by it.

## Checks run against this tree, all passing

- `tsc --noEmit` — 0 errors.
- `node scripts/validate-source.js` — 96 TS/TSX files, syntax-valid.
- `node scripts/engine-invariants.js` — all 8 invariant assertions pass
  (beam width, candidate pool, club constraint, GK-last bench ordering ×2,
  fail-closed squad validation, chip event history shape, chip half-reset
  logic) — confirming no chip-timing or engine regression.
- `node scripts/release-preflight.js` — passes; reports
  `Version: 3.2.0 / Android versionCode: 320`.
- `npx expo lint` — 0 errors. 7 pre-existing warnings remain in files this
  integration didn't touch (`app/_layout.tsx`, `app/(tabs)/live.tsx`,
  duplicate `react-native` import splits in `forecast.tsx`/`squad.tsx`);
  left alone as out of scope. The one real lint **error** this pass found
  (an unescaped apostrophe in `forecast.tsx`, pre-existing in the 3.1.0
  base) and one unused `Pill` import in `league.tsx` (pre-existing, on a
  line adjacent to this pass's actual edit) were both fixed.
- `npx vitest run tests/logic.test.ts tests/spy.test.ts` — 34/34 pass.
- `npm run validate` (tsc + source validation + tests) — passes end to end.

## What was NOT changed

- No existing scoring formula, beam search, bench-ordering, chip-timing, or
  validation logic in `lib/analytics/*` or `lib/dataService.ts` was altered
  — only additive fields/imports were added, confirmed by
  `engine-invariants.js` still matching its pinned regressions and by
  `tests/logic.test.ts` passing unmodified.
- `app/(tabs)/chips.tsx`, `chipOptimizer.ts`, `recommendChipTiming.ts`,
  `dgwIntel.ts`, and the rest of the chip-timing feature set from the
  3.1.0-with-chip-timing base are untouched by this integration.
