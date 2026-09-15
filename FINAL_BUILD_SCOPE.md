# DGH FPL Manager 2.5.0 — Ultimate Merge Scope

This release merges the broadest supplied DGH application with the newer DGH ledger/What-If implementation.

## Authoritative DGH scoring

**GW Adjusted = Raw FPL Points − Transfer Hits − BB Bench Deduction − TC 3rd Deduction**

- Raw points: `entry_history.points`
- Transfer hits: `entry_history.event_transfers_cost`
- BB deduction: `entry_history.points_on_bench` only when `active_chip === "bboost"`
- TC deduction: additional 1× captain-points amount only when `active_chip === "3xc"`
- Bonus points are already included in raw FPL points and are never double-counted.
- No “Bonus Pounds” scoring exists in this build.

## Merge policy

The larger supplied application remains the feature base; the newer DGH implementation overlays the canonical season store, DGH ledger service, FPL client, comprehensive table, What-If engine, and league UI.

The supplied Ultimate prompt is included verbatim at `docs/DGH_ULTIMATE_FINAL_BUILD_PROMPT.txt` as the acceptance/roadmap specification.

## Important build truth

This package is source/build-ready. Release preflight and deterministic source checks are included. An actual APK still requires a functioning Android/EAS build environment and credentials/network access. This package does not contain fabricated build-success claims.
