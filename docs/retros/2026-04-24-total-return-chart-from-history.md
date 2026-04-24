# Total Return Chart From History Retro
**Date:** 2026-04-24
**Branch:** `Highcharts-Refactor`

---

## What Was Done

### 1. Replace the snapshot-based portfolio chart with a history-based total return chart
**Commit:** Not committed yet

Changed files:
- `client/src/components/PortfolioValueChart.jsx`
- `client/src/pages/DashboardPage.jsx`
- `server/routes/history.js`
- `server/services/totalReturnService.js`

`PortfolioValueChart` no longer reads daily snapshots. The dashboard now fetches `GET /api/history/total-return`, and the chart renders a Highcharts total return view with a shaded `Total value` series and a dotted `Net deposits` series.

The backend builds the chart from cached Trading 212 history and Yahoo Finance daily market prices because Trading 212 does not currently provide a historical daily account-value endpoint.

### 2. Add Trading 212 transaction syncing
**Commit:** Not committed yet

Changed files:
- `server/db/schema.js`
- `server/services/rateLimiter.js`
- `server/services/syncService.js`

Added a `transactions` table and sync support for `GET /api/v0/equity/history/transactions?limit=50`.

Full sync now fetches all transactions. Incremental sync fetches only new transactions by `reference`. If Trading 212 returns `403` for missing transaction-history scope, sync logs a warning, records that transactions are unavailable, and continues without failing the rest of the dashboard.

### 3. Share Trading 212 to Yahoo ticker conversion
**Commit:** Not committed yet

Changed files:
- `server/utils/tickerUtils.js`
- `server/routes/heatmap.js`

Moved the existing ticker conversion into a shared server utility so the new total-return service and the existing heatmap route use the same Trading 212 to Yahoo symbol rules.

### 4. Handle delisted and renamed historical holdings
**Commit:** Not committed yet

Changed files:
- `client/src/components/PortfolioValueChart.jsx`
- `server/services/totalReturnService.js`
- `server/utils/tickerUtils.js`

Added Yahoo symbol candidates for known renamed holdings such as `HCN_US_EQ -> WELL`, `IPOE_US_EQ -> SOFI`, `VACQ_US_EQ -> RKLB`, and `DEAC_US_EQ -> DKNG`.

The total-return service now suppresses verbose Yahoo schema-validation dumps, caches failed price lookups for 24 hours, and falls back to order fill prices when a delisted symbol has no usable Yahoo chart history. Those symbols are reported separately as `estimatedSymbols` so the frontend can explain that part of the chart is estimated instead of silently pretending it is exact.

Also fixed FX lookup behavior so the first day a foreign-currency holding appears can use the latest available prior FX quote when Yahoo has no exact same-day quote.

### 5. Add correctness guardrails for unsafe reconstructed totals
**Commit:** Not committed yet

Changed files:
- `client/src/components/PortfolioValueChart.jsx`
- `server/services/totalReturnService.js`

Fixed the cash impact sign for historical orders. Trading 212 stores `fill.walletImpact.netValue` as a positive wallet value in local data, so BUY fills must reduce reconstructed cash and SELL fills must increase reconstructed cash.

Added validation before returning chart points. The route now refuses to return a total-return chart when transaction history starts after order history, when reconstructed holdings do not match current Trading 212 positions, or when the latest reconstructed value is more than 2% away from `account_summary.total_value`.

When validation fails, the route returns no points, an `unavailableReason`, and diagnostics showing the current summary value, reconstructed latest value, delta percent, earliest order and transaction dates, and holding mismatch counts. The frontend shows the reason instead of drawing a misleading chart.

### 6. Import the Trading 212 Excel export and reconcile to face values
**Commit:** Not committed yet

Changed files:
- `server/package.json`
- `server/package-lock.json`
- `server/db/schema.js`
- `server/scripts/importT212Export.js`
- `server/services/totalReturnService.js`
- `client/src/components/PortfolioValueChart.jsx`

Added the `xlsx` dependency because the historical source file is an Excel workbook and the repo had no existing Excel parser.

Added a one-off import script:

```powershell
node server\scripts\importT212Export.js --file "c:\Users\afraz\Documents\trading212 exports\Master\2020 to april 1 2026 - Copy.xlsx" --net-deposits 72808.58 --anchor-date 2026-04-24
```

The import reads the `All Transactions` sheet, stores normalized rows in `t212_export_rows`, and stores the Trading 212 net-deposits anchor in `sync_state`.

The local import loaded `5,385` rows with a date range from `2020-06-16T14:33:45.000Z` to `2026-04-01T18:32:09.000Z`. Workbook deposits and withdrawals totalled `75562.53`. API transactions after the workbook reduced that to `72832.54`, then the explicit reconciliation adjustment of `-23.96` brought the latest net deposits to the Trading 212 face value of `72808.58`.

The total-return service now prefers imported export rows when present. It still uses API orders, dividends, and transactions after the export latest timestamp so the chart can continue from the workbook date to the current account summary date.

The latest chart point is designed to reconcile to Trading 212's current face values only after the raw reconstruction passes validation:
- `account_summary.total_value`
- `account_summary.invest_current_value`
- `account_summary.invest_unrealized_pl`
- the stored net-deposits anchor

The route still exposes diagnostics for the raw reconstruction. In the final local diagnostic run, the raw Yahoo/export reconstruction was `129358.52`, which was `8.92%` below the Trading 212 summary value. Because that is outside the 2% guardrail, the service returned `points: []` with an `unavailableReason` instead of drawing a misleading chart. It also reported the required `marketValueReconciliationAdjustment` of `12667.77` so the remaining gap is visible for follow-up work.

---

## Key Findings

- The official Trading 212 docs and OpenAPI spec still list current account summary, positions, historical orders, dividends, exports, and transactions, but not historical daily total account values.
- A fully historical value line therefore has to be estimated from orders, cash movements, dividends, and historical market prices.
- Net deposits are now based on the full Trading 212 workbook through `2026-04-01`, API transactions after that timestamp, and an explicit anchor to Trading 212's stated `72808.58` value on `2026-04-24`.
- Local order-derived holdings alone do not reliably reconcile to Trading 212 positions. Some closed, renamed, split-adjusted, or corporate-action holdings remain difficult to rebuild from public market data.
- Yahoo can return no chart data or incomplete chart metadata for delisted/renamed instruments. Treating these as partial estimates keeps the chart usable without hiding data quality issues.
- The current positions and account summary are the safest source of truth for today's face values, so the final point is anchored to those values and the adjustment is reported in diagnostics.

---

## Implementation Notes

- `GET /api/history/total-return` returns `currency`, `estimated`, `partial`, `missingSymbols`, and `points`.
- The response can also include `unavailableReason`, `diagnostics`, `estimatedSymbols`, `netDepositReconciliationAdjustment`, and `marketValueReconciliationAdjustment`.
- Imported workbook rows are stored separately from API `orders`, `dividends`, and `transactions`, so the import does not overwrite synced API data.
- Cash is rebuilt from transactions, dividends, and order wallet impacts.
- When workbook rows are present, cash and holdings are rebuilt from the Trading 212 export first, then API history after the export latest timestamp.
- Historical prices use the existing `yahoo-finance2` dependency through `chart(..., { interval: '1d', events: 'split' })`.
- Export trade identity uses ISIN first and ticker fallback second.
- Yahoo `GBp`/pence prices are converted to GBP by scaling by `0.01`.
- Non-account-currency quotes are converted with Yahoo FX history when available.
- The final chart point is reconciled to `account_summary.total_value` only after the pre-anchor raw reconstructed value is within 2% of the Trading 212 summary.
- Current positions are reconciled to `account_summary.invest_current_value`.
- Current unrealised P/L is reconciled to `account_summary.invest_unrealized_pl`.
- Latest net deposits must match the stored `72808.58` anchor after the explicit net-deposit adjustment.
- Missing Yahoo price lookups are cached as failures for 24 hours so repeated dashboard refreshes do not keep hammering the same delisted symbols.
- Fill-price fallback values are used only when Yahoo has no usable prices for that instrument. They keep the value reconstruction approximate, not exact.
- BUY order wallet impacts are treated as cash outflows and SELL order wallet impacts are treated as cash inflows.
- Validation fails closed by returning `points: []` with an `unavailableReason` instead of drawing a bad chart.

---

## Verification

- `node --check` passed for the changed server modules and routes.
- `node --check server\scripts\importT212Export.js` passed.
- `node --check server\services\totalReturnService.js` passed.
- `node --check server\db\schema.js` passed.
- The Trading 212 Excel import completed with `5,385` imported rows and detected the expected `2020-06-16` to `2026-04-01` range.
- The total-return diagnostic returned `points: 0` with this reason: `Total return history is unavailable because the latest reconstructed value is more than 2% away from the Trading 212 account summary.`
- The latest diagnostics showed `summaryUnrealisedPl: 55790.09`, `reconstructedUnrealisedPl: 55790.96`, and `unrealisedPlDelta: 0.87`.
- The latest diagnostics showed `netDepositsBeforeReconciliation: 72832.54` and `netDepositReconciliationAdjustment: -23.96`.
- The latest diagnostics showed `rawReconstructedLatestValue: 129358.52`, `rawReconstructedLatestValueDeltaPercent: 8.92`, and `marketValueReconciliationAdjustment: 12667.77`.
- `npm.cmd run build` from the repo root passed on 2026-04-24.
- The existing Vite large-chunk warning still appears and was not introduced by this change.
- Service-level sign checks passed for BUY cash, SELL cash, signed TRANSFER net deposits, and the 2% summary tolerance.

---

## Current State

- The snapshot pipeline remains in place because `BenchmarkChart` still uses snapshots.
- `PortfolioValueChart` now uses Highcharts instead of Recharts.
- The total-return route now uses the imported Trading 212 workbook as the historical source of truth when those rows are available.
- The route refuses to draw the chart in the current local state because the pre-anchor raw reconstructed value is still outside the 2% guardrail.
- The net-deposits line reconciles to the Trading 212 face value of `72808.58` as of `2026-04-24`.
- If reconciliation fails in a future run, the route returns an unavailable state instead of a graph.
- If Yahoo cannot provide some historical prices or FX rates after validation otherwise passes, the response marks the chart as `partial` and the UI shows a small warning. Delisted fill-price fallbacks are listed separately in the UI.
- The raw reconstruction still has a visible gap against Trading 212's latest value, so the diagnostics include the market-value reconciliation adjustment needed before a chart can be safely shown.

---

## Next Step

Investigate the remaining raw reconstruction gap. The likely follow-up is to add more precise corporate-action handling and per-instrument reconciliation for positions that still need fill-price fallback or do not line up exactly with Yahoo adjusted history.
