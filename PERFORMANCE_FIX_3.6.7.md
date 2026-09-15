# DGH FPL Manager 3.6.7 — Enrichment Pipeline Performance Pass

## What was slow

The full "enrichment" pass of `loadWarRoomData()` (Spy, chip timing, TES,
deadline-notification scheduling) ran as a strictly sequential chain of
`await`s, so their latencies summed instead of overlapping. TES additionally
re-fetched every finished player's full round-by-round history on almost
every enrichment pass, because `elementSummary` was cached for only 10
minutes even though that data is static for any player not currently mid-
fixture. Rival squad fetches were also capped at a concurrency of 6, which
under-uses the available request budget for larger leagues.

None of this affected correctness — `engine-invariants.js` and the full
`logic.test.ts`/`spy.test.ts` suites (50 tests) pass unchanged — it was
purely wall-clock latency in the background refresh path.

## What changed

| File | Change |
|---|---|
| `lib/dataService.ts` | Spy, TES, and deadline-notification scheduling — three independent async steps that don't read each other's output — now run concurrently via `Promise.all` instead of sequentially. Enrichment latency is now bounded by the slowest of the three, not their sum. Price-alert dispatch (which *does* depend on Spy's output) still runs after, unaffected. |
| `lib/dataService.ts` | Rival squad fetch concurrency raised from 6 → 10 (`mapWithConcurrency`), cutting wave count roughly in half for typical mini-league sizes. |
| `lib/config.ts` | `CACHE_TTL_MS.elementSummary` raised from 10 min → 60 min. Per-player round histories only change while that player is in a live fixture; the previous TTL meant TES re-fetched the same static histories on almost every refresh. |

## What did NOT change

- No scoring, chip-timing, transfer-engine, or validation logic was touched.
- The fast/cached-first startup path (`loadCachedWarRoomData`, the
  `fast: true` snapshot refresh) is unaffected — this pass only changes the
  background "full enrichment" path, which was already designed to never
  block first paint.
- Every step's individual try/catch (best-effort, never-blocks-the-rest-of-
  war-room-data) behavior is preserved; parallelizing them did not change
  failure isolation — a Spy failure still can't affect TES or notifications,
  and vice versa.

## Version

- `package.json`: `3.6.6` → `3.6.7`
- `app.config.ts`: `version: "3.6.7"`, `versionCode: 347` (was 346)

## Checks run against this tree, all passing

- `pnpm install` (existing `pnpm-lock.yaml`, `pnpm@9.12.0`) — clean install.
- `npx tsc --noEmit` — 4 pre-existing errors, all outside this pass's
  changes (rival-shell DGH-field typing at lines ~330-340, and a
  `fixturesResultEarly` fast/full cache-shape union at ~503/~550) — not
  introduced or touched by this change.
- `node scripts/engine-invariants.js` — PASS.
- `node scripts/validate-source.js` — 132 TS/TSX files, syntax-valid.
- `node scripts/release-preflight.js` — passes; reports
  `Version: 3.6.7 / Android versionCode: 347`.
- `npx vitest run tests/logic.test.ts tests/spy.test.ts` — 50/50 pass.
