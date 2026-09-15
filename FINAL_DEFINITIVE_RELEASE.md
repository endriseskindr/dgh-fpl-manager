# DGH FPL Manager 3.6.6 — Definitive EAS Release

## Performance architecture
- War Room startup hydrates from a complete persisted renderable snapshot before any network refresh.
- First paint has an interactive shell even when no snapshot exists.
- Official FPL refresh runs in the background after the shell is available.
- Full fixture download is excluded from the fast refresh path.
- Rival API enrichment, DGH ledger sync, Spy/TES work and heavy intelligence remain background work.
- Endpoint requests are coalesced so concurrent refreshes share one in-flight request.
- Network results return before persistent AsyncStorage writes complete.
- Complete War Room snapshots are persisted asynchronously for the next launch.
- Heavy War Room analytics and performance-audit work run after interactions.
- Notification/background-task registration is deferred until after interactions.
- LoadingShell skeleton states are restored across secondary screens; blocking War Room loading was not restored.
- Error and retry states remain available.

## Release identity
- App version: 3.6.6
- Android versionCode: 346
- Android package: com.app.dghfpldominator
- Expo SDK: 54
- React Native: 0.81.5
- EAS APK profile: release-apk
- EAS production profile: app-bundle

## Verification performed
- Performance preflight: PASS
- TypeScript/TSX source syntax validation: PASS (132 files)
- DGH engine invariants: PASS
- Release preflight: PASS

A native EAS build was not executed in this packaging environment; build credentials/network are required for the actual EAS compile.
