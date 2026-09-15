# DGH FPL Manager 3.1.0 — Build-Ready Merge

This zip merges the 3.1.0 rebuild (newest UI/feature set) with the dependency
fixes verified to work in the 2.7.1 EAS-repair build, plus one additional
fix found by static audit. Base source: DGH-FPL-DOMINATOR-3_1_0-FINAL-REBUILT.

## Changes made vs. the 3.1.0 source

1. **Added `babel-preset-expo` and `expo-asset` as explicit dependencies.**
   `babel.config.js` requires `babel-preset-expo` directly, but the 3.1.0 zip
   only had it as a nested transitive dependency of `expo`
   (`node_modules/expo/node_modules/babel-preset-expo`), not hoisted to the
   project root. Under pnpm's default (non-hoisted) linking that import fails
   to resolve — a Metro bundling failure during the EAS build itself. Same
   root cause for `expo-asset` (a peer dependency of `expo-audio`).

2. **Removed both `package-lock.json` and `pnpm-lock.yaml`.**
   The project declares `"packageManager": "pnpm@9.12.0"`, but shipped with
   an npm lockfile alongside a pnpm lockfile — an ambiguous, conflicting
   pair. Both were also now stale against the dependency additions above, so
   keeping either risked a `pnpm install --frozen-lockfile` failure (lockfile
   doesn't match package.json). Run `pnpm install` after unzipping to
   regenerate a clean, matching lockfile.

3. **Fixed `app.config.ts` version mismatch.** The 3.1.0 source's
   `package.json` said version `3.1.0` and `versionCode: 310`, but
   `app.config.ts` — the file that actually controls the version shipped to
   users/app stores — still read `version: "2.5.0"`. Corrected to `3.1.0` so
   all three agree.

4. **Added `.gitignore` and `.easignore`.** Neither existed in any of the
   three source zips. Without them, an uncontrolled `node_modules`/`.git`
   upload can inflate an EAS build archive by 100x+ and cause upload
   timeouts. Harmless today, but a landmine the moment this gets `git init`'d.

## Not changed (flagged, not fixed)

- `drizzle-orm`/`drizzle-kit` scaffolding (`drizzle.config.ts`, `drizzle/`
  folder) is present but never imported by any app code — the real
  persistence layer is still direct `expo-sqlite` calls in
  `lib/seasonStore.ts`. It's inert, not build-blocking, so it was left in
  place rather than guessing at your intent for it.

## Before your first `eas build`

```bash
corepack enable
pnpm install
npx expo-doctor
pnpm run preflight
eas build -p android --profile preview
```

The very first build on this project must run interactively (not
`--non-interactive`) so EAS can generate a keystore.
