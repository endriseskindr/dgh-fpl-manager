# DGH FPL Manager 3.6.5 — Final Release

## Release status
EAS-ready production release focused on true instant startup, snapshot-first hydration, and non-blocking background FPL intelligence.

## Final fixes
- Startup is snapshot-first and network-free: the first screen renders from the last complete War Room snapshot when available.
- Core refresh runs after first interaction; full rival squad enrichment runs in a bounded background pool.
- Background enrichment cannot recursively retrigger itself.
- FTSI identical-squad scoring returns 100 for truly identical squad/XI/captaincy/formation inputs.
- Validation checklist is consistently 14 points.
- Validation test fixtures now use real non-empty rival squads for the clean-dataset case.
- Added regression coverage for missing rival squads.
- Fixed Manager Lookup lint apostrophe errors.

## Verification target
The release validation suite is intended to be clean: TypeScript, source validation, performance preflight, engine invariants, lint, and all logic tests.

Version: 3.6.5
Android versionCode: 345


## 3.6.5 performance hardening
- Complete War Room snapshot persisted asynchronously for next-launch instant hydration.
- Same-endpoint FPL requests are coalesced to prevent duplicate network calls.
- Persistent cache writes no longer delay fresh API responses.
- Fast refresh uses one cached snapshot read instead of per-rival storage fan-out.
- Full fixtures, Spy, TES, chip timing, ledger synchronization, and notification work remain outside the fast path.
- Root notification/background registration is deferred until after initial interactions.
