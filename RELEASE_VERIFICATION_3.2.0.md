# DGH FPL Manager 3.2.0 — Release Verification

## Baseline
Used `DGH-FPL-DOMINATOR-3.2.0-FINAList.zip` as the feature/release baseline, merged with the cleaner source behavior from `DGH-FPL-DOMINATOR-3_2_0-CLEAN (1).zip`.

## Cleanup / fixes
- Removed unused backend/API/database dependencies: tRPC, axios, cookie, dotenv, Express, jose, mysql2, superjson, Drizzle ORM tooling.
- Removed unused backend/database scaffold files (`template.json`, `drizzle/`, `drizzle.config.ts`) and the reset-project helper.
- Restored the cleaner live polling effect implementation so the interval is not recreated on every data-object refresh.
- Removed the debug `console.log` from the theme provider.
- Removed unused Expo starter/legacy image assets and unused reference-document payloads.
- Kept the DGH background-task registration and release/preflight/test tooling.

## Checks run in this environment
- TypeScript/TSX source syntax validation: PASS (93 files).
- DGH engine invariants: PASS.
- Release preflight: PASS.
- No remaining references to removed backend/scaffold packages/files in app/components/hooks/lib/scripts/tests/package.json: PASS.
- No `console.log`/`console.debug`/`console.info` calls in runtime app/components/hooks/lib code: PASS.

## Build note
A native EAS Android build was not executed in this container because the package manager/dependency registry was not reachable, so this archive is statically release-checked but is **not** a claim that an APK/AAB has already been produced. Use the included `release-apk` EAS profile for the installable APK build.

## Live DGH scoring hardening

- Live mini-league now derives DGH GW points from every manager's current squad rather than only official `event_total`.
- Formula: `RAW LIVE PTS - TRANSFER HITS - BENCH BOOST BENCH PTS - TRIPLE CAPTAIN EXTRA`.
- Live player bonus is surfaced separately but is not double-counted because FPL live `total_points` already includes awarded/provisional bonus.
- Automatic substitutions follow official bench priority and formation rules; future/unfinished club fixtures are not prematurely auto-substituted.
- Wildcard and Free Hit managers are marked DQ and placed below the lowest eligible/relegated manager for the GW DGH table.
- All mini-league managers remain visible even when an individual squad fetch fails; such rows are explicitly marked as official-GW fallback/unverified.
- Current FPL Wildcard/Free Hit rules preserve banked free transfers; the free-transfer estimator no longer resets them to one.
- Transfer cash simulation uses the official pick selling price when available rather than assuming current market price equals selling price.
