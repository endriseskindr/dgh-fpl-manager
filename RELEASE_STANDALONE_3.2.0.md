# DGH FPL Manager 3.2.0 — Standalone Release

- Direct official FPL API runtime; no Render dependency.
- `pnpm-lock.yaml` is the canonical lockfile; `package.json` declares `pnpm@9.12.0`.
- Android edge-to-edge is explicitly enabled for Expo SDK 54 / modern Android behavior.
- Rival squad fetch failures remain fail-safe and are surfaced as unverified/unavailable rather than fabricated.
- The `release-apk` EAS profile is configured for APK output.

This archive is source-ready for an EAS Android build. A successful cloud/native build still requires EAS credentials and network access to the package registry/build service.
