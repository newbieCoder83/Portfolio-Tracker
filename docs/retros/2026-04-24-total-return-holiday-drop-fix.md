# Total Return Holiday Drop Fix Retro
**Date:** 2026-04-24
**Branch:** `Highcharts-Refactor`

---

## What Was Done

### 1. Ignore invalid Yahoo price and FX rows
**Commit:** Not committed yet

Changed files:
- `server/services/totalReturnService.js`

Added strict market-price parsing for Yahoo chart rows. The reconstruction now treats `null`, empty, zero, negative, and non-finite prices as missing instead of valid prices.

The bug was caused by JavaScript converting `null` to `0` through `Number(null)`. Yahoo sometimes returns FX rows with `close: null` and `adjclose: null` on market holidays. Those rows were being stored as valid `0` FX rates, which made USD holdings temporarily value at `0 GBP`.

### 2. Carry forward last valid prices on closed-market days
**Commit:** Not committed yet

The market-value calculation now searches for the latest valid prior price or FX rate when a date has no valid quote. Daily chart points are preserved, but holidays and weekends use the last available market value instead of dropping to zero.

### 3. Add suspicious drop diagnostics
**Commit:** Not committed yet

Added `diagnostics.suspiciousValueDrops` for raw total-return responses. It flags daily drops over 50% when net deposits did not move enough to explain the fall. This is a debug signal, not a chart blocker.

---

## Key Findings

- The extreme chart drops occurred on closed-market or holiday-adjacent dates:
  - `2025-01-01`
  - `2025-04-17` / `2025-04-18`
  - `2025-12-25`
  - `2026-01-01`
- Local Yahoo checks showed `USDGBP=X` returning null FX rows on these dates.
- Fixing invalid FX handling also improved the latest raw reconstruction delta because bad zero-rate rows had been polluting the reconstructed market value.

---

## Verification

- `node --check server/services/totalReturnService.js` passed.
- Raw total-return smoke test returned `drops: []` and `suspiciousValueDrops: []`.
- Known bad dates now carry forward smoothly:
  - `2025-01-01` matches `2024-12-31`.
  - `2025-12-25` matches `2025-12-24`.
  - `2026-01-01` matches `2025-12-31`.
- `GET /api/history/total-return` now returns `2139` points with `delta: 0.08`.
- `npm run build` passed. The existing Vite large-chunk warning still appears.

---

## Current State

- The extreme random-looking drops are fixed in the raw reconstruction.
- The main Dashboard total-return endpoint now passes the 2% reconciliation gate in the current local state.
- This change does not address stale holdings or the remaining share-count mismatch diagnostics.

---

## Next Step

Reload `/total-return` and the Dashboard total-return chart to visually confirm the spike removal and that the Dashboard chart now renders normally.
