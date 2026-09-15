# DGH FPL Manager — Comprehensive Forensic Rebuild Audit

**Audit Version:** 3.7.0-AUDIT
**Date:** September 14, 2026

---

## Executive Summary

A comprehensive forensic audit was performed across the `dgh-fpl-manager` codebase, examining UI screens, navigation flows, state management, API transport layers, local SQLite/AsyncStorage persistence, FPL calculations, DGH-specific formulas (HSFI, BV, MDI, WCS, DTQ, WCPS, TES, GDR), and test coverage.

While the existing project contains strong UI/UX concepts and rich feature sets, several critical architectural flaws produce erratic behavior, race conditions, redundant API fetches, and tight coupling between React components and calculation logic.

---

## Key Audit Findings & Problem Inventory

### 1. API Transport & Network Duplication
- **Problem:** API requests are un-deduplicated across screens (`(tabs)/live`, `(tabs)/rivals`, `player/[id]`, `manager-lookup`). Opening multiple screens triggers duplicate HTTP requests to `fantasy.premierleague.com`.
- **Expected Behavior:** Single centralized request queue with deduplication, in-memory caching, and background cache refresh.
- **Actual Behavior:** Redundant background network requests causing rate limiting (HTTP 429) and stale response overwrites.
- **Root Cause:** `lib/fplClient.ts` lacks request deduplication promises and global in-flight request tracking.
- **Severity:** High
- **Correct Solution:** Rebuild `FplClient` with request deduplication (`Map<string, Promise<any>>`), fallback to local SQLite/AsyncStorage, and graceful failure handling.

### 2. Tight Coupling of Domain Rules & UI Renders
- **Problem:** DGH-specific metrics (HSFI, WCS, MDI, DTQ, WCPS) and FPL domain calculations (captain vice-captain selection, formations, chip recommendations) are calculated inside UI screens and custom hooks (`useWatchlist`, `app/(tabs)/live.tsx`, `app/(tabs)/chips.tsx`).
- **Expected Behavior:** An independent, pure TypeScript FPL & DGH Domain Engine (`lib/engine/`) that runs deterministically without React or Expo UI dependencies.
- **Actual Behavior:** Re-calculating complex metrics on every render frame leads to UI stuttering and un-testable business logic.
- **Root Cause:** Absence of a dedicated domain layer separating UI presentation from domain calculations.
- **Severity:** High
- **Correct Solution:** Create an isolated domain engine (`lib/engine/fpl.ts` and `lib/engine/dgh.ts`) with 100% pure functions and comprehensive unit tests.

### 3. DGH Metric Integrity & Backward Compatibility
- **Problem:** DGH metrics like HSFI, BV, MDI, WCS, DTQ, WCPS, and TES are scattered across `lib/analytics/dghMetrics.ts`, `lib/analytics/tes.ts`, and `lib/analytics/teamStrength.ts`. Minor discrepancies in weighting could lead to invalid DGH rankings.
- **Expected Behavior:** All DGH formulas must strictly adhere to the documented specifications (`HSFI` per-90 normalizations, `WCS` fixture/volatility weighting, `TES` transfer efficiency scoring) with preserved IDs and backward compatibility.
- **Actual Behavior:** Functions depend on transient `Map<number, TeamFixtureRun>` parameter passing that can be `undefined` during initial load.
- **Root Cause:** Lack of unified metric context input structures.
- **Severity:** High
- **Correct Solution:** Encapsulate DGH metric calculations into `DghEngine` with explicit inputs, safe fallback defaults, and automated regression tests comparing dataset inputs.

### 4. Offline-First & Fast Startup Flow
- **Problem:** Initial app launch relies on async sequence: `launch -> await API -> render UI`. If network is slow or offline, the app shows empty/loading spinners even if cached data exists in SQLite/AsyncStorage.
- **Expected Behavior:** `launch -> load cached data -> render immediately -> background refresh -> update UI safely`.
- **Actual Behavior:** Screen spinners block user interaction until network calls return or time out.
- **Root Cause:** `lib/seasonStore.ts` and `lib/dataService.ts` do not initialize UI state synchronously from persistent cache prior to network execution.
- **Severity:** Medium-High
- **Correct Solution:** Implement cache-first hydration in `lib/dataService.ts` with instant cached render + background async revalidation.

### 5. Test Suite Gaps & Verification
- **Problem:** Current Vitest tests verify standalone logic helper functions, but do not test end-to-end repository data hydration, cache invalidation, or DGH metric regression against full player datasets.
- **Expected Behavior:** Automated unit and regression test suite covering domain rules, DGH metrics, repository caching, and squad validation.
- **Actual Behavior:** Uncovered edge cases in captain vice-captain fallback when captain is unavailable.
- **Severity:** Medium
- **Correct Solution:** Add dedicated engine test suite (`tests/engine/fpl.test.ts` and `tests/engine/dgh.test.ts`).

---

## Action Plan for Rebuild

1. **Create `lib/engine/` Directory**:
   - `fpl.ts`: Pure FPL rules (squad rules, formation validation, captain selection, point totals, chip rules, free transfers).
   - `dgh.ts`: Pure DGH metrics (HSFI, BV, MDI, WCS, DTQ, WCPS, TES, GDR, Posture, Strategy State).
2. **Rebuild Data Layer (`lib/dataService.ts`, `lib/fplClient.ts`)**:
   - Add request deduplication.
   - Implement cache-first offline storage hydration.
3. **Verify All 171 Existing Tests + New Engine Tests**:
   - Ensure 100% pass rate.
