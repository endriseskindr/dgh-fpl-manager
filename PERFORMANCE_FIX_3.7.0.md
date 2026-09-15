# DGH FPL Manager 3.7.0 — Rival Typing Fix + Enrichment Perf Tracing

## What this release is

3.7.0 merges the source-only 3.7.0 patch (originally delivered as an
incomplete delta ZIP missing the project's base tree) onto the verified
3.6.7 base, fixes the two pre-existing `tsc --noEmit` errors that 3.6.7's
own release notes flagged and left unresolved, and fixes one additional
stale check in `performance-preflight.js` discovered during this merge.

## What changed

| File | Change |
|---|---|
| `lib/dataService.ts` | `makeRivalShell(...)` now initializes `dghGwPoints`, `dghTotalPoints`, `dghRank`, `dghGapToMe` to `null`. This was the root cause of 4 of the 6 pre-existing `tsc` errors (`TS2339`/`TS2551` on the `rivalResults` union type) present in both 3.6.6 and 3.6.7 — the shell object's inferred type never declared these fields even though the DGH-ledger merge loop later assigns to them. |
| `lib/dataService.ts` | Added `perfStart`/`perfMark`/`perfEnd` instrumentation across `loadWarRoomData` (snapshot load, bootstrap, core endpoints, before/after ledger sync, analytics-complete, end) via the new `lib/performanceTrace.ts`. Dev-only (`__DEV__` gated), zero production overhead. |
| `lib/fplClient.ts` | `getCachedJson<T>()` return type and both return paths now include `stale: false`, matching the shape already used by every other cached fetch path in this file. This was the other root cause: the remaining 2 pre-existing `tsc` errors (`.stale` accessed on a union branch that lacked it). |
| `lib/fplClient.ts` | Entry-history fetch now uses its own `CACHE_TTL_MS.history` (10 min) instead of reusing `CACHE_TTL_MS.entry` (5 min) — history data doesn't need to be as fresh as live entry state. |
| `lib/config.ts` | Added the `history` cache TTL entry backing the above. |
| `lib/performanceTrace.ts` | New file. Minimal dev-only timing logger, no dependencies. |
| `scripts/performance-preflight.js` | Fixed a stale check inherited from the 3.6.7 base: it hardcoded a literal match for `mapWithConcurrency(rivalRows, 6`, but 3.6.7 itself had already raised that value to `10` without updating this check — so the script had been silently checking for a value that no longer existed since 3.6.7 shipped. Replaced with a regex that validates the call has *some* finite, sane bound (1–25) rather than a specific number, so it won't go stale on the next legitimate concurrency tuning pass. This mirrors the same fix class already applied to `release-preflight.js`'s version check in 3.2.0 (see `INTEGRATION_NOTES.md`). |

## What did NOT change

- No scoring, chip-timing, transfer-engine, or validation logic was touched beyond the type fixes above.
- `app/(tabs)/whatif.tsx` from the original 3.7.0 patch delta was **not** applied — that file was a 0-byte empty file in the source patch (a packaging/export corruption), which would have deleted the working What-If screen entirely. The verified 360-line 3.6.7 version is unchanged in this release.

## Version

- `package.json`: `3.6.7` → `3.7.0`
- `app.config.ts`: `version: "3.7.0"`, `versionCode: 349` (was 347)

## Verification performed (this environment, independently — not self-reported)

- `pnpm install --frozen-lockfile` — clean install, 1068 packages, lockfile unchanged.
- `npx tsc --noEmit` — **0 errors** (previously 6, across the two root causes above).
- `node scripts/engine-invariants.js` — PASS.
- `node scripts/validate-source.js` — 133 TS/TSX files, syntax-valid.
- `node scripts/performance-preflight.js` — PASS (after the stale-check fix above).
- `node scripts/release-preflight.js` — PASS; reports `Version: 3.7.0 / Android versionCode: 349`.
- `npx vitest run` (full `test:logic` suite, 9 files) — **158/158 pass**.
- `npm run validate` (tsc + source validation + performance preflight + tests) — PASS end to end.
- `npm run release:check` (preflight + validate) — PASS end to end.
- `npx expo lint` — 0 errors, 3 pre-existing warnings in files untouched by this release (`app/_layout.tsx` duplicate import, `app/fpl-wide.tsx` unused import).

## Environment-dependent final step

- `eas build` itself still requires network access to Expo's build servers and valid EAS credentials, neither available in this sandbox. This package is source/build-ready, not a compiled APK. Run `eas build --platform android --profile release-apk` in a network-enabled, credentialed environment to produce the actual APK.
