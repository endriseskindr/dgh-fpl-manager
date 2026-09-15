# DGH FPL Manager — Android Build Guide

This package is an Expo SDK 54 React Native project configured for portrait Android builds through Expo Application Services (EAS). The app is **read-only**: it provides DGH decision support and exports, but never submits transfers, captaincy changes, chips, or account actions.

## Local setup

Install Node.js, pnpm, and the EAS CLI, then install dependencies from the project root:

```bash
pnpm install
eas login
```

Run the deterministic release checks before a native build:

```bash
pnpm release:check
```

The Expo-token integration check is deliberately separate and only runs when a real `EXPO_TOKEN` is available:

```bash
pnpm test:integration
```

## Android APK

Create the installable internal APK with the dedicated release profile:

```bash
pnpm build:apk
```

Equivalent EAS command:

```bash
eas build --platform android --profile release-apk
```

The `release-apk` profile is configured with `android.buildType: "apk"`.

## Google Play bundle

Create the production Android App Bundle with:

```bash
pnpm build:android
```

The `production` profile is configured with `android.buildType: "app-bundle"`.

## Important configuration

The Android package identifier is `com.app.dghfpldominator`, the app display name is `DGH FPL Manager`, and the app icon assets are under `assets/images/`.

The mobile intelligence layer reads **official FPL API endpoints directly from the Android client** and persists last-known-good data locally. No private FPL credential is embedded in the APK. The broader OAuth/tRPC server template remains available, but it is not required for the core FPL decision engine.

## Release verification truth

This ZIP is source/build-ready, not an APK. A real APK still requires a functioning EAS/Android build environment and valid EAS credentials/network access. The release scripts must never claim an APK was built when only source validation has passed.

## Current implementation scope

The release includes the Dashboard/War Room, Live Tracker, Mini-League, DGH Comprehensive Table, Transfer Intelligence, What-If analysis, My Squad, Rival analysis, Fixtures, Ownership, Chips, Player Detail, exports, local DGH ledger persistence, notifications/background checks, and deterministic release invariants.
