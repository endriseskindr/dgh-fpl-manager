# DGH FPL Manager 3.2.0 — Standalone APK Architecture

## Release architecture

The Android APK is intentionally standalone for this release:

**Android app → Official Fantasy Premier League API**

The app does not require Render, a private backend, a public API origin, or `EXPO_PUBLIC_API_BASE_URL` to fetch FPL data.

## Data reliability

`lib/fplClient.ts` is the authoritative FPL transport layer. It provides short-lived in-memory caching, persistent AsyncStorage fallback, retry/backoff for transient failures, and stale-data signalling.

A rival squad that cannot be fetched from the official FPL API is represented as unavailable; the app does not fabricate picks or treat unavailable rival data as verified intelligence.

## Build

Use the `release-apk` EAS profile in `eas.json` to produce an APK. Keep the existing `pnpm-lock.yaml` and use the package manager declared by `package.json` (`pnpm@9.12.0`).

## Backend status

Render/backend deployment is intentionally out of scope for version 3.2.0 standalone APK release. Backend source and historical deployment notes may remain in the repository for future use, but they are not runtime dependencies of the APK.
