# Stale Reconstructed Holdings Fix Retro
**Date:** 2026-04-25
**Branch:** `Highcharts-Refactor`

---

## What Was Done

### 1. Classify known corporate-action edge cases
**Commit:** Not committed yet

Changed files:
- `server/services/totalReturnService.js`

Added a small classification layer for corporate actions that Yahoo exposes as split-style metadata but Trading 212 represents differently.

`O_US_EQ` and `PFE_US_EQ` now ignore the known Yahoo quantity factors because those were spin-off or demerger price adjustments, not parent-share count changes in the Trading 212 export.

`AAPL_US_EQ` and `TSLA_US_EQ` keep their true Yahoo split factors for normal split-adjusted quantity handling, but broker-settled fractional remnants are now explained and reconciled separately.

### 2. Reconstruct the missing ONL opening quantity
**Commit:** Not committed yet

Changed files:
- `server/services/totalReturnService.js`

Trading 212 had an `ONL` sell row but no opening stock-distribution row. The reconstruction now derives the missing Orion Office REIT distribution from the Realty Income holding quantity using the `1 ONL / 10 O` ratio.

The synthetic ONL holding starts on the first usable Yahoo ONL price date, `2021-11-23`, so the chart does not create a missing-symbol gap before Yahoo has ONL quote data.

### 3. Remove closed-position residuals after broker-settled split handling
**Commit:** Not committed yet

Changed files:
- `server/services/totalReturnService.js`

Added a replay step before final chart construction. It finds reconstructed residual quantities for instruments that Trading 212 currently reports as closed, then adds zero-cash quantity corrections on the last activity date.

This clears the AAPL and TSLA fractional remnants without changing open holdings such as `HON_US_EQ`.

### 4. Add explicit diagnostics
**Commit:** Not committed yet

Changed files:
- `server/services/totalReturnService.js`

Added `diagnostics.corporateActionDiagnostics` so these special cases are visible instead of being silent adjustments.

---

## Key Findings

- Realty Income's Orion spin-off distributed `1 ONL` share for every `10 O` shares. The export had the later ONL sale but not the opening distribution.
- Pfizer's Viatris transaction was represented by Trading 212 as demerger cash plus a same-day Pfizer reinvestment, so Yahoo's `1054:1000` style price adjustment should not change Pfizer share count.
- Apple and Tesla had real splits, but the export also had split-related cash/order rows. The remaining stale quantities were fractional remnants after applying the normal split-adjusted reconstruction.
- `HON_US_EQ` still has a separate open-position mismatch and was intentionally left alone.

Sources checked:
- Realty Income / Orion spin-off: https://www.realtyincome.com/investors/press-releases/realty-income-completes-spin-orion-office-reit
- Pfizer / Viatris distribution: https://www.pfizer.com/news/press-release/press-release-detail/pfizer-announces-details-when-issued-and-ex-distribution
- Apple split history: https://investor.apple.com/dividend-history/default.aspx
- Tesla 5-for-1 split: https://ir.tesla.com/press-release/tesla-announces-five-one-stock-split

---

## Verification

- `node --check server/services/totalReturnService.js` passed.
- `node --check server/services/corporateActionsService.js` passed.
- `node --check server/services/historicalPriceService.js` passed.
- `node --check server/routes/history.js` passed.
- Raw total-return smoke test returned:
  - `stale: []`
  - `missing: []`
  - `estimated: []`
  - `drops: []`
  - `delta: 0.44`
  - remaining mismatch: `HON_US_EQ`
- `npm run build` passed. The existing Vite large-chunk warning still appears.
- `git diff --check` passed. Git still reports the existing LF-to-CRLF warning for `server/services/totalReturnService.js`.

---

## Current State

- The five stale reconstructed holdings are cleared locally.
- Latest raw total-return delta remains below the 2% tolerance.
- Corporate-action special handling is limited to total-return reconstruction and does not change schemas, `.env`, dependencies, or frontend files.

---

## Remaining Risks

- The ONL synthetic holding starts on Yahoo's first usable ONL quote date, not the legal distribution date, to avoid an unpriceable gap.
- The closed-position residual pass should be watched if future exports contain a genuine closed-position residual for a reason unrelated to corporate actions.
- `HON_US_EQ` remains unresolved and needs a separate investigation.
