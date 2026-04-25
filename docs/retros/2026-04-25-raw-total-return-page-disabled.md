# Raw Total Return Page Disabled Retro
**Date:** 2026-04-25
**Branch:** `Highcharts-Refactor`

---

## What Was Done

### 1. Remove the raw diagnostic page from active navigation
**Commit:** Not committed yet

Changed files:
- `client/src/App.jsx`
- `client/src/components/Layout.jsx`

Removed the active `/total-return` frontend route and the `Total Return` navigation tab. The raw diagnostic page is no longer visible in the app, and directly visiting `/total-return` now falls through to the existing dashboard redirect.

The source files were intentionally kept:
- `client/src/pages/RawTotalReturnPage.jsx`
- `client/src/components/RawTotalReturnChart.jsx`

They can be restored later by re-adding the route and tab.

### 2. Archive the drift conclusion
**Commit:** Not committed yet

New file:
- `docs/drift-findings-and-conclusion.md`

Added a plain-English handover note covering the current drift state, why deeper historical accuracy is not worth chasing right now, how the latest-point Trading 212 anchor behaves, and why daily real Trading 212 snapshots should keep being saved for future use.

---

## Key Findings

- Latest raw reconstruction is close enough for personal tracking at about 0.04% drift.
- Remaining historical drift is small and not actionable without per-position Trading 212 values for the affected dates.
- Trading 212 does not provide a clean historical daily account-value summary API, so old account values must be reconstructed from events, prices, FX, and corporate actions.
- The raw page was useful for debugging but no longer needs to be part of the active app.
- Keeping daily `snapshots` is still worthwhile because those records become future ground truth.

---

## Verification

- `npm run build` should be run after this change.
- Confirm the `Total Return` tab is no longer visible.
- Confirm `/total-return` redirects to `/dashboard`.
- Confirm the Dashboard still loads and keeps its existing total-return chart.
- Optional diagnostic script remains available: `node server/scripts/diagnoseDriftAtDates.js`.

---

## Current State

- The raw total-return UI is archived but preserved in source.
- Backend raw diagnostics and historical-price refresh endpoints remain available for future debugging.
- The active app is simpler and avoids loading the raw diagnostics page during normal use.

---

## Remaining Risks

- Future users may not notice the preserved raw page unless they read `docs/drift-findings-and-conclusion.md`.
- If drift work is reopened, the raw page will need to be manually re-wired into the frontend route and navigation.
