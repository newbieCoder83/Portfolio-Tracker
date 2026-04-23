# Drawdown Chart Removal Retro
**Date:** 2026-04-23
**Branch:** `Highcharts-Refactor`

---

## What Was Done

### 1. Remove the Drawdown chart feature from the dashboard
**Commit:** `8d787a5`

Changed files:
- `client/src/components/DrawdownChart.jsx`
- `client/src/pages/DashboardPage.jsx`

Removed the `DrawdownChart` component from the dashboard and deleted the component file entirely so the feature is no longer shipped in the client.

The dashboard layout was also adjusted so the `BenchmarkChart` now takes the full row width instead of leaving an empty space where the drawdown card used to be.

### 2. Add the feature retro
Changed files:
- `docs/retros/2026-04-23-drawdown-chart-removal.md`

Recorded why the feature was removed, what was left in place, and the current verification state for future handover.

---

## Key Findings

- The old drawdown implementation was based on `snapshots.total_value`, which makes the result sensitive to cash flows and snapshot timing rather than just market decline.
- Because the chart tracked changes from the running peak of total portfolio value, deposits and uneven snapshot spacing could distort the result and make the drawdown figure misleading.
- Removing the feature was smaller and safer than trying to patch the existing logic, especially since the current data source was already considered the wrong foundation.
- Snapshot data still has valid downstream use in the app. `PortfolioValueChart` and `BenchmarkChart` still depend on snapshots, so the snapshot fetch and backend snapshot route were intentionally left untouched.

---

## Deviations from the Request

1. Kept the snapshot pipeline in place instead of removing snapshot-related backend and fetch code.
Reason: snapshots are still required by other dashboard features, so removing them would have broken unrelated working charts.

2. Expanded the benchmark card to full width after removal.
Reason: this avoids leaving a dead half-row in the dashboard layout and keeps the page balanced after the feature is gone.

---

## Issues Encountered

- There were already unrelated local modifications in the working tree before this removal:
  `client/src/components/DividendHistoryTable.jsx`
  `docs/retros/2026-04-23-dividend-history-table-grid-refactor.md`
- Those files were left untouched by this removal work.
- The existing Vite large-chunk warning still appears during production builds. This removal did not cause it.

---

## Current State

- `DrawdownChart.jsx` has been removed from the client.
- The dashboard no longer imports or renders the drawdown feature.
- `BenchmarkChart` now occupies the full dashboard row where the benchmark + drawdown pair used to sit.
- Snapshot fetching remains active because it is still used by `PortfolioValueChart` and `BenchmarkChart`.
- The feature removal itself is committed in `8d787a5`.
- `npm.cmd run build` from the repo root passed successfully on 2026-04-23.

---

## Next Step

If you want a replacement in the future, build it from a cash-flow-aware portfolio history model rather than raw daily snapshots of total account value. If you do not plan to replace it, the next sensible follow-up is just a quick browser check to confirm the wider benchmark row looks right on desktop and mobile.
