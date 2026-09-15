# DGH FPL Manager 3.6.0 — Android startup fix

## What changed
- The War Room now uses a fast first-pass load.
- Core FPL data requests are started in parallel.
- Mini-league standings pagination uses a bounded 4-request worker pool instead of a 25-page waterfall.
- Rival squad requests use up to 8 concurrent requests during the fast first pass.
- Expensive historical DGH ledger synchronization is deferred to background enrichment.
- DGH Spy and Transfer TES historical enrichment are deferred to background enrichment.
- Notification scheduling/price-alert storage is deferred to the background enrichment pass.
- The existing last-known-good DGH ledger remains available immediately.
- Manual Refresh and Full Data Reset still perform the complete non-fast pipeline.
- Android display name is now `DGH FPL Manager` while the existing Android package ID is retained for app identity continuity.

## Important
No software build can honestly be declared completely bug-free without executing the native EAS Android build and testing the resulting APK/AAB on physical Android devices. This source ZIP passes the included source/invariant/release-preflight checks.
