# DGH FPL Manager 3.5.0 — DGH Metrics Engine Upgrade

This release integrates the missing DGH strategic metrics into the existing 3.2.2 architecture without replacing the existing projection, transfer, chip, rival, spy, or live engines.

## Added

- Canonical weekly-practical HSFI (0–100)
- Buy Value (BV)
- Mini-League Dominance Index (MDI)
- Weekly Ceiling Score (WCS)
- Differential Threat Quotient (DTQ)
- Weekly Captain Power Score (WCPS)
- Weekly Swing Potential
- Template Coverage
- Mini-League EV
- Volatility Balance Metric (VBM)
- Live Differential Impact (LDI)
- Podium Probability Score (PPS)
- Strategy-state classification
- 10-GW performance-gate audit
- Wildcard/full-reset trigger after 3+ failed gates
- Transfer cards now expose MDI gain, incoming MDI, WCS and DTQ
- War Room now surfaces the DGH Metrics Engine and 10-GW audit

## Data-integrity notes

The FPL API does not expose per-player last-five-GW haul percentage or xGI volatility in bootstrap-static. The app therefore uses deterministic available-data estimates for WCS/MDI until per-player history is explicitly loaded. These values are labelled in the War Room rather than silently presented as external observations.

The ledger does not store mini-league relegation rank or a historical transfer log. The 10-GW audit therefore leaves those gates pending rather than incorrectly inferring them from global FPL rank.

The public FPL API provides bootstrap, live-event, entry/history, picks, league standings and fixture data without requiring an API key on the public endpoints; the app continues to use its existing client/cache architecture. See the included web verification notes for endpoint context.
