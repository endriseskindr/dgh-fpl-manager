# Ported from x402-fpl-api-main — dgwIntel.ts + recommendChipTiming.ts

Source: x402-fpl-api-main/app/algorithms/dgw_intel.py and chips.py
Audit conversation: capability diff against DGH's existing lib/analytics/*

## dgwIntel.ts
Ports the FPL-API-only half of dgw_intel.py: pure double/blank-gameweek
detection from fixtures DGH already fetches (no new dependencies, no network
calls beyond what the app already does).

NOT ported: the community web-scraping half (premierleague.com,
allaboutfpl.com via httpx + regex, 1hr cache). That needs a small backend to
do properly — a client app scraping those sites has no shared cache (every
device hits them independently) and breaks silently if either site's HTML
changes. Revive it server-side only if DGH ever stands up a backend for
other reasons (see fetchCommunityDgwIntel / mergeIntelWithApiPredictions in
the original x402 repo for the shape to match).

## recommendChipTiming.ts
Layers x402's chip-SEQUENCING logic (chips.py) on top of DGH's existing
chipOptimizer.ts, which already values a single chip in a single gameweek.
Adds:
  - a scan across a 10-GW window (via dgwIntel.scanDgwBgw) to find which
    future gameweeks are worth checking at all
  - the Wildcard-before-Bench-Boost combo bonus — the single highest-value
    chip interaction in the source material — wildcarding the week before
    your best bench-boost week to rebuild the bench for that double

LIMITATION carried over from the original: scanning future gameweeks reuses
today's squad, prices, and ownership for every candidate gw. There is no way
to know a future price change, injury, or transfer-market shift ahead of
time. Treat scores for gw > next gameweek as directional, not precise.

## Integration
Both files are exported from lib/analytics/index.ts. Type-checked standalone
against the existing chipOptimizer.ts / chips.ts / xiOptimizer.ts /
projection.ts / types.ts chain with zero errors (tsc --noEmit, es2020,
moduleResolution bundler).

## Closed in 3.2.0 (see INTEGRATION_NOTES.md for the full writeup)

All items below were "still open" as of the 3.1.0 pass and are now ported.
None replace an existing DGH signal — each is additive and surfaced as a
second opinion / supplementary panel alongside the original.

  - **Captain-scoring model** (`captainAlt.ts`, ported from x402's
    captain.py) — an alternative captain scorer with different weights,
    surfaced in the Squad tab as "Second opinion (x402-ported model)".
    `projection.ts` remains the primary signal everywhere else (transfers,
    XI, chip optimizer). Per the original recommendation, this was NOT
    silently swapped in — backtesting both against real results before
    replacing anything is still the right call before that changes.
  - **Multi-GW horizon for transfers** (`multiGwHorizon.ts`, ported from
    x402's transfers.py `_player_value_score`) — a GW/GW+1/GW+2 weighted
    outlook (weights 1.0/0.5/0.3, unchanged from source), shown in the
    Transfers tab as a "3-GW outlook" alongside the existing next-GW-only
    transferEngine.ts beam search, which is unmodified.
  - **Price-change prediction** (`priceIntel.ts`, ported from x402's
    prices.py) and **injury/news signal** (`newsIntel.ts`, ported from
    x402's news.py) — both net-new, now feeding the DGH Spy tab, the
    League tab's "Market movers" strip, and the Transfers tab's move-level
    price/news callouts.
  - **Rival transfer-pattern prediction** (`rivalIntel.ts`, ported from
    x402's rivals.py `_predict_next_move` / `_find_weaknesses` /
    `bootstrap_top_transfers_in`) — heuristic transfer-out/in candidates
    and squad weaknesses, surfaced on the Rival detail screen and in DGH
    Spy. Still a heuristic guess from current squad/form/fixtures, not a
    leak of a rival's actual plans (limitation carried over verbatim from
    the source).
  - **"DGH Spy" feature** (`spyService.ts`, built from scratch on top of
    the four modules above) — the intelligence feed assembling price
    movers, news/injury alerts (mine + rivals'), and rival transfer
    predictions for every DGH mini-league rival. Isolated in its
    own try/catch at the dataService.ts call site: a Spy computation
    failure never blocks the core war room data.

## Still open (unchanged from the 3.1.0 audit)
  - `dgw_intel.py`'s community web-scraping half (premierleague.com,
    allaboutfpl.com) — still needs a backend to do properly; not revived.
  - x402's defensive-contribution-per-90 term in both captain.py and
    transfers.py — DGH's `EnrichedPlayer`/`FplElement` doesn't fetch
    `defensive_contribution_per_90` from bootstrap-static, so it's omitted
    from `captainAlt.ts` and `multiGwHorizon.ts` rather than approximated.
  - x402's "dreamteam" appearance-count term in captain.py — same reason,
    omitted rather than approximated.
