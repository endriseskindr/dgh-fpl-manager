# DGH FPL Manager 3.5.0 — FPL-Wide Intelligence + Live DefCon

## Included
- Independent rank→points ladder page jumps for ranks 1, 100, 1K, 5K, 10K, 50K, 100K, 300K and 1M.
- Top-10K overall-manager sampler using the official FPL overall league, current-GW full XI/bench picks, captaincy, formation and active-chip data.
- Exact XI Clone Detector and overlap distribution.
- Position-weight / formation benchmarking against the sampled cohort.
- Club contribution analytics using official player/live points when available.
- Popular Transfers engine restricted to transfers actually recorded for the selected gameweek.
- Weekly Awards taxonomy, Why This Happened narrative scaffold, Star/Flop/Killer callouts.
- Live DefCon tracker with home/away context. If the official live feed does not expose defensive contribution, the UI shows unavailable rather than inventing a proxy.
- FPL-Wide Intelligence screen and More-menu entry.

## Architecture note
The Top-10K sampler is intentionally opt-in because full squad reconstruction is thousands of manager-level requests. It uses the official FPL API and skips private/inaccessible managers without fabricating data.
- Reusable DGH badge/tag component and squad pitch/DNA overlay.
