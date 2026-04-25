# Allocation Donut Highcharts Refactor Retro
**Date:** 2026-04-25
**Branch:** `Highcharts-Refactor`

---

## What Was Done

### 1. Replace the allocation donut with Highcharts
**Commit:** Not committed yet

Changed files:
- `client/src/components/AllocationPieChart.jsx`

Replaced the Recharts allocation donut with a Highcharts `pie` series using `innerSize` so it renders as a donut chart.

The component still accepts the same `positions` prop from `DashboardPage`, keeps the same 1.5% threshold for grouping small holdings into `Other`, keeps the same card title and empty state, and keeps the same position-detail and Other-holdings dialogs.

### 2. Add color-plus-pattern fills
**Commit:** Not committed yet

Changed files:
- `client/src/components/AllocationPieChart.jsx`

Loaded Highcharts pattern fills with `highcharts/esm/modules/pattern-fill.src.js`, which matches the ESM Highcharts instance used by `@highcharts/react` in this app.

Each slice keeps the existing allocation color palette as the pattern background and adds a subtle white SVG pattern stroke. This gives the slices another visual distinction without changing the overall dashboard palette.

### 3. Let Highcharts handle donut layout
**Commit:** Not committed yet

Changed files:
- `client/src/components/AllocationPieChart.jsx`

Removed the local `ResizeObserver`, active Recharts sector, captured label refs, and custom collision-resolution SVG label layer.

The new chart uses Highcharts pie options for sizing and fixed center placement. Slice clicks are now handled through Highcharts point click events.

### 4. Tighten the outside connector labels
**Commit:** Not committed yet

Changed files:
- `client/src/components/AllocationPieChart.jsx`

The first Highcharts pass used outside pie labels aligned to the plot edges. On the dashboard this pushed names far away from the donut and created long connector lines across the card.

The chart still uses outside connector labels, but no longer aligns them to the plot edges. The final layout keeps the spider-web style with shorter connectors by using a smaller label distance, small connector padding, fixed-offset connector lines, and a smaller donut size so the labels have nearby room around the chart.

### 5. Scale the donut up after visual review
**Commit:** Not committed yet

Changed files:
- `client/src/components/AllocationPieChart.jsx`

After a dashboard visual check, the donut looked better with the tighter connector style but did not use enough of the available card space.

The chart now increases the donut size by roughly 15% (`58%` to `67%`) and increases the outside label distance by roughly 10% (`12` to `13`). The responsive fallback was adjusted by the same idea (`50%` to `58%`, label distance `8` to `9`) so narrow layouts keep a similar feel.

---

## Key Findings

- Highcharts supports donut charts through pie `innerSize`, so no new dependency was needed.
- The pattern-fill module must be loaded for pattern colors. The ESM path works with the installed Highcharts React wrapper.
- Highcharts' plot-edge pie label alignment was too visually heavy for this allocation card. Keeping outside labels but removing plot-edge alignment preserves the desired spider-web look without pushing names to the card edges.
- Once the plot-edge alignment was removed, the donut had enough room to scale up without returning to the earlier stretched connector layout.

Sources checked:
- Highcharts pattern fills: https://www.highcharts.com/docs/chart-design-and-style/pattern-fills
- Highcharts pie `innerSize`: https://api.highcharts.com/highcharts/series.pie.innerSize
- Highcharts pie label alignment: https://www.highcharts.com/docs/advanced-chart-features/pie-datalabels-alignment
- Highcharts React v4 options usage: https://www.highcharts.com/docs/react/v4-migration-guide

---

## Verification

- `npm run build` from the repo root passed on 2026-04-25.
- The existing Vite large-chunk warning still appears and was not introduced by this refactor.
- Browser-based manual verification was not completed in this pass, so final visual spacing and click behavior should still be checked on the dashboard.
- Follow-up build after tightening the outside connector labels also passed on 2026-04-25.
- Follow-up build after increasing donut size and connector label distance also passed on 2026-04-25.

---

## Current State

- `AllocationPieChart.jsx` now uses Highcharts instead of Recharts.
- The allocation chart renders as a patterned donut.
- The chart uses outside connector labels, but the labels now sit much closer to the donut instead of being pushed to the plot edges.
- The donut is scaled up from the first tightened-label pass, with labels given a slightly longer connector distance.
- Normal holding slices still open the existing detail dialog.
- The Other slice still opens the grouped holdings dialog, and selecting a grouped holding still opens its detail dialog.
- No API, server, database, auth, env, dependency, or dashboard prop changes were made.

---

## Remaining Risks / Next Step

- The production build verifies the code path, but it does not prove the label collision behavior is ideal at every dashboard width.
- The most useful follow-up is a short browser QA pass on desktop and mobile widths to confirm label spacing, patterns, tooltip content, and slice-click behavior.
