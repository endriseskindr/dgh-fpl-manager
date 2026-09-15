# DGH FPL Manager — Mobile Interface Design Plan

## Product intent

DGH FPL Manager is an Android-first fantasy football strategy companion for managers who want a single, decision-ready view of live FPL data, exact DGH mini-league scoring, transfer trade-offs, and weekly award performance. The interface prioritizes one-handed portrait use, fast scanning before a deadline, and transparent explanations for every recommendation.

## Screen list and layout

| Screen | Primary content and functionality |
|---|---|
| Command Center | Current gameweek status, deadline countdown, overall DGH position, projected rank movement, recommended action, expected points, and a compact live-status strip. The primary CTA opens the strategy plan. |
| Comprehensive League | Horizontally scrollable but vertically compact comprehensive table. Each manager row shows GW adjusted points, overall points, rank, podium count, money won, fees, fines, and net money. A filter sheet switches between current GW, season, podiums, and finances. |
| Live GW | Live event status, points updates, captain returns, bench contribution, transfer hits, and a refresh control. Loading, stale-data, and unavailable states are explicit. |
| Squad | Current XI and bench in pitch order, captain and vice-captain badges, fixture difficulty, ownership, expected points, and quick optimizer entry. |
| Transfers | Transfer engine with sell/buy selectors, budget impact, free-transfer balance, hit cost, expected-point delta, and confirmable scenario creation. |
| What-If Lab | Scenario cards comparing no transfer against one or more proposed moves. Each card shows XI, captain, bench, projected DGH adjusted points, rival gap, rank movement, podium/win probability, risk, and net strategic gain/loss. |
| Rivals | Rival manager cards with gap to first, recent GW trend, threat level, targetable players, and head-to-head impact. |
| Fixtures | FDR matrix and upcoming fixture run for the user's squad, rivals, and selected players. |
| Ownership | Ownership leaders, effective-ownership pressure, differentials, and risk-adjusted upside. |
| Chips | Chip availability, recommended windows, projected award and rank impact, and a clear rationale. |
| More / Settings | League configuration, manager metadata, prize pool, entry fee, fine rules, cache refresh, data-source status, export, and app information. |
| Player detail | Player form, minutes, fixtures, ownership, expected points, transfer relevance, and scenario add action. |

## Key user flows

1. **Pre-deadline strategy:** Command Center → Strategy Plan → review best strategy, transfers, XI, captain, bench, hit/no-hit, expected points, net gain, rival impact, probability, risk, and rationale → open What-If Lab for alternatives.
2. **League review:** Command Center → Comprehensive League → switch GW/season/finance filters → tap a manager row → inspect rival detail and gap drivers.
3. **Transfer simulation:** Transfers → select sell and buy players → review budget, free transfers, hits, projected XI and captain → save scenario → compare in What-If Lab.
4. **Live scoring:** Live GW → pull to refresh or tap refresh → inspect raw points, transfer hit, bench boost deduction, triple-captain third deduction, and adjusted score.
5. **Configuration:** More → League Settings → edit prize pool, fee, relegation fine, manager list, and applicable gameweeks → save locally → refresh ledger.

## Color choices

The brand uses a deep **#07111F** midnight navy background for focus, **#0E1D2E** elevated surfaces, **#B8F23A** electric lime for actionable strategy and positive performance, **#F5F7FA** soft white for primary text, **#8FA1B5** slate for supporting text, **#33D17A** green for gains, **#FFB547** amber for warnings and chip windows, **#FF6B6B** coral for hits and losses, and **#2A3B50** blue-gray borders. The palette is intentionally high-contrast for deadline scanning while reserving lime for decisions rather than decoration.

## Interaction principles

The app uses a bottom-tab structure for the highest-frequency destinations, native-feeling press feedback, large one-handed touch targets, bottom sheets for filters and configuration, and explicit data freshness labels. Every numerical recommendation must expose the underlying scoring inputs so managers can distinguish official data from projections.
