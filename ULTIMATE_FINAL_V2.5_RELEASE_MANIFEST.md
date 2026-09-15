# DGH FPL Manager Ultimate Final V2.5.0

## Merge basis
- V2.4.0 Ultimate broad production architecture
- V2.3.2 elite-manager and Player DNA capabilities
- Unified DGH ledger/weekly-awards integration
- Supplied Ultimate Final Build Prompt

## Authoritative DGH scoring
GW Adjusted = Raw FPL Points - Transfer Hits - BB Bench Deduction - TC 3rd Deduction

Bonus Points are already included in Raw FPL Points and are never double-counted.
Bonus Pounds are NOT a scoring component.

## Release
- App version: 2.5.0
- Android versionCode: 250
- APK profile: release-apk
- Android package: `com.app.dghfpldominator`
- Core mobile data source: official FPL API, with local last-known-good caching
- App is read-only; it never submits FPL account actions

## Fixed in final build-prep pass
- Corrected zero-free-transfer handling so the first transfer is a real -4 hit when no FT remains.
- Added current-GW vs planning-GW semantics so live GW screens do not mislabel next-GW transfer projections.
- Corrected captain multipliers in What-If, rival, transfer-impact, and predicted-table projections.
- Corrected What-If rival ahead/behind direction.
- Included the user's own manager in DGH ledger and weekly-award backfills.
- Corrected tied podium prize splitting.
- Fixed release validation script wiring and made the EXPO_TOKEN network test opt-in.
- Removed a malformed source-reference filename that broke release source validation on extraction.
- Updated Android build documentation to match the actual `release-apk` profile and current client architecture.

## Verification truth
- Release preflight and deterministic source/invariant checks are included.
- This artifact is source/build-ready, not an APK. A real APK requires a functioning EAS/Android build environment, valid credentials, and network access.
- No fabricated APK build-success claim is included.
