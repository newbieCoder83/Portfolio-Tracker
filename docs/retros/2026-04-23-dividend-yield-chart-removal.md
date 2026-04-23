# Dividend Yield Chart Removal Retro
**Date:** 2026-04-23
**Branch:** `Highcharts-Refactor`

---

## What Was Done

### 1. Remove the dividend yield chart feature from the dashboard
**Commit:** `8d787a5`

Changed files:
- `client/src/components/DividendYieldChart.jsx`
- `client/src/pages/DashboardPage.jsx`

Removed the `DividendYieldChart` feature from the client by deleting the component file and removing its import and render path from the dashboard.

The dashboard layout was also adjusted so `DividendHistoryTable` now takes the full row width instead of leaving an empty split layout behind.

### 2. Add the feature retro
Changed files:
- `docs/retros/2026-04-23-dividend-yield-chart-removal.md`

Recorded why the feature was removed, what was intentionally left in place, and the current verification result for future handover.

---

## Key Findings

- The old yield chart was not calculating trailing 12 month dividend yield correctly. It summed all available dividend history, then annualized that total across the full observed date range, which is not the same thing as a true trailing-12-month yield.
- The feature was also redundant with the Positions table, which already shows dividend income and yield alongside other position context that makes the numbers easier to interpret.
- Removing the feature was the safer option than trying to patch incorrect financial logic that the user no longer wants.
- The removal is isolated. No backend endpoints or shared client data loaders were specific to this chart, so the cleanup stayed small.

---

## Deviations from the Request

1. Left the dividend and position data fetching in place.
Reason: both are still needed by other dashboard features, including the Positions table, Monthly Dividend chart, Dividends By Company, and Dividend History table.

2. Expanded the Dividend History table to full width after removal.
Reason: this avoids leaving a dead half-row in the dashboard layout and keeps the page balanced once the yield chart is gone.

---

## Issues Encountered

- There were already unrelated local changes in the working tree before this removal:
  `client/src/components/DividendHistoryTable.jsx`
  `client/src/components/DrawdownChart.jsx`
  `docs/retros/2026-04-23-dividend-history-table-grid-refactor.md`
  `docs/retros/2026-04-23-drawdown-chart-removal.md`
- Those files were left as-is unless this removal directly required touching them.
- The existing Vite large-chunk warning still appears during production builds. This removal did not cause it.

---

## Current State

- `DividendYieldChart.jsx` has been removed from the client.
- The dashboard no longer imports or renders the dividend yield feature.
- `DividendHistoryTable` now occupies the full final dashboard row.
- The feature removal itself is committed in `8d787a5`.
- `npm.cmd run build` from the repo root passed successfully on 2026-04-23.

---

## Next Step

If you want to keep yield information available in the future, the next sensible approach would be to show it only in the Positions table using a properly defined trailing-12-month calculation, rather than maintaining a separate chart for it.
