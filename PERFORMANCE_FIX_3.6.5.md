# DGH FPL Manager 3.6.5 — Instant Startup / Stale-While-Revalidate

## Performance architecture
- The War Room query is now network-free at startup and hydrates a complete renderable snapshot from AsyncStorage.
- The first screen can render immediately even with no network and no cached FPL response; the UI shell remains interactive.
- A background core refresh fetches only bootstrap, league standings, your squad, cached history, cached fixtures and live data.
- Full fixtures, rival squad fan-out, DGH ledger synchronization, Spy, TES, chip timing and notifications are deferred to background enrichment.
- Concurrent requests to the same FPL endpoint are coalesced.
- Persistent cache writes are fire-and-forget and never delay returning fresh network data.
- The complete War Room snapshot is persisted after every successful core/full refresh for true next-launch instant hydration.
- Root notification/background-task setup is deferred until after initial interactions.
- Manual refresh, automatic refresh and enrichment share an in-flight refresh guard to prevent duplicate pipelines.
- The War Room keeps the last visible snapshot while refresh/enrichment is running.

## Verification
- `scripts/performance-preflight.js` now checks for the actual snapshot-first architecture, request coalescing and non-blocking cache writes.
- Existing functionality and analytics modules are preserved; changes are limited to startup orchestration, caching, refresh coordination and one duplicated UI metric label.
