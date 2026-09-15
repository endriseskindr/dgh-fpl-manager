# DGH FPL Manager 3.6.4 — Startup & Post-Open Performance Fix

## Startup contract
- The War Room mounts immediately without waiting for FPL network requests.
- A first-paint interactive shell provides navigation shortcuts while data loads.
- Cached FPL data is preferred before network refreshes.
- The ~20-manager mini-league rival squad fan-out remains background-only on the fast pass.
- Heavy recommendation, dominance, horizon and DGH metric calculations run after React interactions via `InteractionManager.runAfterInteractions`.
- Existing cached/full data remains visible while background enrichment updates it.
- Error/retry states remain available if the initial data pipeline fails.

## Regression protection
`validate:performance` now checks for the interactive first-paint shell, deferred analytics, cache-first reads, bounded rival enrichment and absence of the legacy full-screen startup loading branch.

## Release
- App version: 3.6.4
- Android versionCode: 344
