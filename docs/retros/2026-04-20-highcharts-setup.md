# Highcharts Migration — Phase 0 Setup Retro
**Date:** 2026-04-20
**Branch:** `Highcharts-Refactor`

---

## What Was Done

Infrastructure-only work to prepare for replacing Recharts with Highcharts. No individual chart components were touched.

### 1. Install packages
**Commit:** `5bea158`

```bash
cd client && npm install highcharts @highcharts/react
```

Recharts was left in `package.json` so existing charts continue to render while per-chart refactors happen later.

### 2. Global Highcharts theme
**Commit:** `36aef9d`

New file: `client/src/highchartsTheme.js`. Palette mirrors `client/src/theme.js` (MUI dark theme) verbatim so Highcharts visuals blend with the rest of the dashboard without per-chart overrides.

### 3. Wire theme in `main.jsx`
**Commit:** `cbe0bcf`

Added two imports + a single `Highcharts.setOptions(highchartsTheme)` call before `ReactDOM.createRoot().render()`. Nothing else in `main.jsx` changed. Uses the v4 JSX API's named `Highcharts` re-export (`import { Highcharts } from '@highcharts/react'`) — this was flagged as a risk in the plan but the package does export it (verified in `node_modules/@highcharts/react/Highcharts.js`).

### 4. Shared utilities
**Commit:** `0dbe025`

New file: `client/src/utils/highchartsUtils.js`. Named exports:

| Export | Purpose |
|---|---|
| `formatCurrency(value, currency='GBP')` | Intl-based "£1,234.56" |
| `formatPercent(value)` | Signed "+1.23%" / "-1.23%" (zero renders as "0.00%" with no sign) |
| `currencyYAxisConfig` | Reusable yAxis options, `title: { text: null }` so overrides are additive |
| `responsiveRules` | Hide legend below 400px width |

The `utils/` directory didn't exist before — this is the first file in it.

### 5. Smoke test (no commit)
Added a temporary `<Chart><Title>Theme Test</Title><Series data={[1,3,2,4,3]} /></Chart>` at the top of `AppContent` in `App.jsx`, ran `npm run dev:client`, visually confirmed the dark theme + indigo series + zero console errors, then reverted `App.jsx` via `git checkout --`.

---

## Versions Installed

| Package | Version |
|---|---|
| `highcharts` | `12.6.0` |
| `@highcharts/react` | `4.2.1` |
| `recharts` (unchanged) | `2.15.4` |

---

## Theme Decisions

- **Palette directly mirrors MUI theme** — no guessing. Primary `#5c6bc0`, secondary `#26c6da`, success/error from the MUI palette. Categorical series palette extends with amber `#ffb74d` and purple `#ab47bc` for variety when more than 4 series are plotted (e.g. allocation pie).
- **`backgroundColor` ≠ `plotBackgroundColor`** — outer chart uses `background.paper` (`#111827`), plot area uses `background.default` (`#0a0e17`). Slight contrast gives the plot area visual depth inside a MUI `<Card>`.
- **Font stack reuses the MUI Inter/Roboto cascade** so axis labels and tooltips are visually consistent with dashboard typography.
- **Series animation reduced to 400ms** from the Highcharts default of 1000ms — finance dashboards feel snappier with quicker entrance animations, and 1s is noticeably laggy on a dashboard with 6+ charts rendering in parallel.
- **`currencyYAxisConfig.title` defaults to `null`** — lets per-chart callers spread in a title (`{ ...currencyYAxisConfig, title: { text: 'Value (£)' } }`) rather than having to override it back to null when they don't want one.

---

## Issues Encountered

- **`.gitkeep` dropped from plan.** The plan added `docs/retros/.gitkeep` assuming the directory didn't exist, but that was based on an exploration miss — the exploration agent checked `f:/Portfolio-Tracker-home/docs/retros/` (outside the git repo) instead of `Portfolio-Tracker/docs/retros/`. The folder already exists and is tracked via the prior `2026-04-15-Auth-session.md` retro, so `.gitkeep` is unnecessary.
- **`import { Highcharts } from '@highcharts/react'` worked first try.** The plan kept a fallback-to-`highcharts` note in case v4 didn't re-export it, but verification against the installed package (`export let Highcharts = HC`) confirmed the spec import is correct.

---

## Next Step

Begin per-chart refactors. Recommended order (simplest → most complex):

1. `DrawdownChart.jsx` (area) — single series, straightforward shape
2. `PortfolioValueChart.jsx` (line/area)
3. `MonthlyDividendChart.jsx` (bar)
4. `DividendsByCompany.jsx` (bar)
5. `DividendYieldChart.jsx` (bar + line combo — first multi-axis test)
6. `BenchmarkChart.jsx` (multi-series line — benchmark vs. portfolio)
7. `AllocationPieChart.jsx` (pie — most custom-rendering in current Recharts version)

Tables (`PositionsTable.jsx`, `DividendHistoryTable.jsx`) are deferred until we evaluate whether Highcharts Grid is worth pulling in — current MUI `<Table>` works fine and Grid is a separate Highcharts product.

Each refactor should reuse `formatCurrency`, `formatPercent`, `currencyYAxisConfig`, and `responsiveRules` rather than re-deriving them inline. Once a chart is successfully ported and validated in the browser, remove its `recharts` imports — but leave the package in `package.json` until all charts are migrated. Final step of Phase 1 will be removing `recharts` from `package.json` in a dedicated commit.
