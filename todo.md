# DGH FPL Manager — 3.2.2 Final Status

## Completed in 3.2.2

- [x] Finished the DGW Intelligence + chip-timing integration: `recommendChipTiming`
      (Wildcard→Bench-Boost sequencing, DGW/BGW-aware heavy-event selection)
      and `dgwIntel`'s official-fixture DGW/BGW scan existed but were never
      called from the app. Wired into `lib/dataService.ts` (`WarRoomData.chipTiming`,
      computed best-effort like Spy) and `app/(tabs)/chips.tsx` (chip windows now
      driven by the DGW-aware recommender instead of a local naive per-event
      scan; added a "DGW radar" section surfacing next DGW/BGW and unconfirmed
      future-DGW signals).
- [x] New regression suite `tests/chip-timing.test.ts` (24 tests) covering
      `dgwIntel` (unscheduled fixtures, likely-future-DGW estimation, scan
      detection, description strings, next-DGW/BGW lookup) and
      `recommendChipTiming` (chip availability, DGW-aware bench-boost scoring,
      wildcard/free-hit heavy-event restriction, the WC→BB combo bonus, scan
      passthrough, `emptyChipTimingPlan`), wired into `test:logic`.
- [x] Version bumped to 3.2.2 / versionCode 322.
- [x] Full verification actually executed in this environment (network was
      available this pass, unlike prior releases):
      `pnpm install --frozen-lockfile` — succeeds, lockfile unchanged.
      `tsc --noEmit` — 0 errors.
      `node scripts/validate-source.js` — 96 TS/TSX files, syntax-valid.
      `node scripts/engine-invariants.js` — all invariants pass.
      `node scripts/release-preflight.js` — passes; reports
      `Version: 3.2.2 / Android versionCode: 322`.
      `npx expo lint` — 0 errors, 0 warnings.
      `pnpm exec vitest run` (full `test:logic` suite) — 99/99 pass across
      4 files (`logic`, `spy`, `compare-and-strength`, `chip-timing`).
      `pnpm run validate` (tsc + source validation + tests) — passes end to end.

## Carried over from 3.2.1 (unchanged this pass)

Live DGH crash fix, What-If metric fix, Wildcard test correction, Team
Strength model/editor, Player Comparison, Saved What-If store, and their
navigation wiring — all verified intact, none touched by this pass.

## Environment-dependent final step

- [ ] `eas build` — still requires network access to Expo's build servers and
      valid EAS credentials, neither available in this sandbox (its network
      allowlist covers npm/pip/GitHub registries only, not Expo's). **Remains
      UNAVAILABLE**, same as every prior release in this repo. Run
      `eas build --platform android --profile release-apk` in a
      network-enabled, credentialed environment to produce the actual APK.
