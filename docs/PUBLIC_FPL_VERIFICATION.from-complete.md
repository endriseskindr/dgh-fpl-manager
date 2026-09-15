# Public FPL tRPC verification

**Origin tested:** `https://dgh-fpl-backend.onrender.com`

## Registered procedures

The router registers these actual FPL procedures: `fpl.dashboard`, `fpl.bootstrap`, `fpl.standings`, `fpl.fixtures`, `fpl.live`, `fpl.player`, and `fpl.rivalSquad`. There is no registered `fpl.transfers` or `fpl.captain` procedure. Transfer and captain intelligence are derived client-side from dashboard data; captain flags are present in `dashboard.mySquad`.

## Results

| Procedure | HTTP | Result |
|---|---:|---|
| `fpl.bootstrap` | 200 | Live official bootstrap returned 38 events and 616 players. Current event selected: Gameweek 1. |
| `fpl.standings` | 200 | League `170174` returned 18 standings rows. |
| `fpl.dashboard` | 200 | Requested league `170174`, entry `871842`; returned a 15-player squad and 616-player pool. `lastUpdated` was `2026-08-28T00:20:19.659Z`. |
| `fpl.fixtures` | 200 | Returned 10 Gameweek 1 fixtures. |
| `fpl.live` | 200 | Returned live rows for 610 elements with live stats and total points. |
| `fpl.player` | 200 | Returned an official player summary with 1 history row and 37 fixture rows. |
| `fpl.rivalSquad` | 500 | The chosen rival’s official picks endpoint returned FPL API 404 for Gameweek 1. This is a real upstream absence/error, not a fallback. |

## Verified team and captain data

`fpl.dashboard` returned entry `871842`, team name `RUMI MESSI`, manager name `Endris A.` and a 15-player squad. The captain flags returned Bryan Mbeumo as captain with multiplier 2 and Bruno Borges Fernandes as vice-captain. Both had official live Gameweek 1 points in the response.

The dashboard reported `standingsCount: 18`, `rivalSquadsFetched: 4`, `rivalSquadFailures: 14`, and `liveElementsCount: 610`. The current code’s `myEntryExcludedFromRivals` flag is true because entry `871842` was not present among the returned league standings rows; this should be interpreted as “the requested entry was not accidentally included in fetched rival picks,” not as proof that the entry appears in the league standings.

## Conclusion

The public backend is reachable and successfully retrieves official FPL bootstrap, standings, dashboard, fixture, live, player, squad, and captain data. Transfer-specific data is not exposed by a registered server procedure. Rival squad coverage is incomplete because 14 upstream picks requests returned 404 for the selected Gameweek 1 data, while 4 rival squads were retrieved successfully. No sample or fake FPL data was used in this verification.
