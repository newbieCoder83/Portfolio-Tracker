# Historical Total Return Drift Fix Retro
**Date:** 2026-04-24
**Branch:** `Highcharts-Refactor`

---

## What Was Done

### 1. Use Yahoo close prices for account value
**Commit:** Not committed yet

Changed files:
- `server/services/totalReturnService.js`

Changed Yahoo price selection from `adjclose` first to `close` first. This avoids using dividend-adjusted prices when dividends are already included separately as cash in the reconstruction.

The strict positive-number parsing from the holiday-drop fix was kept, so null, zero, negative, and non-finite prices are still treated as missing.

### 2. Align split handling with Yahoo's split-adjusted price basis
**Commit:** Not committed yet

Changed files:
- `server/services/totalReturnService.js`
- `server/services/corporateActionsService.js`

Yahoo-backed price series are now treated as split-adjusted. Imported buy, sell, and stock-distribution quantities are converted into current-share basis using future split factors, and forward split events are skipped for Yahoo-backed series to avoid double-applying splits.

Manual and fallback price series still use forward split events because those prices are not assumed to be Yahoo split-adjusted.

### 3. Treat Trading 212 stock split rows as metadata
**Commit:** Not committed yet

Changed files:
- `server/services/totalReturnService.js`

`Stock split open` and `Stock split close` rows are no longer treated as cash/order events or fill-price fallback rows. The reconstruction now derives a split factor from paired open/close rows and uses that only when Yahoo or a manual override does not already provide a split for that date.

### 4. Ignore stale TwelveData split overrides
**Commit:** Not committed yet

Changed files:
- `server/services/corporateActionsService.js`
- `server/services/totalReturnService.js`

Added a manual-only split override helper. The old TwelveData refresh and merged helper remain in place, but total-return reconstruction now reads only manual DB overrides and Yahoo chart splits. This stops old `source='twelvedata'` rows from overriding Yahoo split data.

### 5. Backdate the net-deposit reconciliation adjustment
**Commit:** Not committed yet

Changed files:
- `server/services/totalReturnService.js`

Moved the net-deposit reconciliation adjustment from the anchor date to the first reconstructed date. This keeps the latest net deposits anchored to Trading 212, while fixing historical net deposits that were about GBP 23.96 too high.

### 6. Update stale route comments
**Commit:** Not committed yet

Changed files:
- `server/routes/history.js`

Updated the raw total-return route comment so it no longer says the raw route skips the imported export path.

---

## Key Findings

- Yahoo adjusted close includes dividend adjustments, so it is not the right field for this app's account-value line because dividends are already cash events.
- Yahoo chart data exposes split events and exchange timezone metadata through `yahoo-finance2`, which lets the reconstruction keep split handling explicit and key FX rows by the exchange timezone.
- Current local `corporate_actions` data contains only old TwelveData rows for `AAPL_US_EQ`; no manual overrides are present.
- The remaining share-count mismatch is still `HON_US_EQ`, with reconstructed quantity about `1.0548x` the Trading 212 position.

---

## Verification

- `node --check server/services/totalReturnService.js` passed.
- `node --check server/services/corporateActionsService.js` passed.
- `node --check server/services/historicalPriceService.js` passed.
- `node --check server/routes/history.js` passed.
- `git diff --check` passed. Git still reports existing LF-to-CRLF warnings for touched files.
- Raw total-return smoke test returned:
  - `2022-10-01`: total value `29744.84`, net deposits `30724.18`
  - `2023-06-01`: total value `38720.75`, net deposits `36200.18`
  - `2024-05-01`: total value `56897.33`, net deposits `45690.18`
  - `delta: 0.48`
  - `drops: []`
  - `missing: []`
  - `estimated: []`
  - cached historical prices still used for `ANSS_US_EQ`, `DARKl_EQ`, `MAXR_US_EQ`, and `STOR_US_EQ`
- Gated total-return smoke test returned `2139` points, no unavailable reason, and `delta: 0.48`.
- `npm run build` passed. The existing Vite large-chunk warning still appears.

---

## Current State

- Historical net deposits now include the anchor adjustment from the first chart date.
- Historical values for split-heavy Yahoo-backed holdings are much higher on old dates because quantities and Yahoo's split-adjusted close prices now use the same basis.
- The dashboard endpoint still passes the 2% reconciliation gate locally.
- The holiday-drop fix and historical price cache behavior were preserved.

---

## Remaining Risks

- `HON_US_EQ` still has a real share-count mismatch that likely needs a separate corporate-action investigation.
- Manual browser verification is still needed on `/total-return` and the dashboard chart.
