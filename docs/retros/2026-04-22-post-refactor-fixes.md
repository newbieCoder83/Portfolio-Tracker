# Post-Refactor Fixes Retro
**Date:** 2026-04-22
**Branch:** `Highcharts-Refactor`

---

## What Was Done

### 1. Add Trading 212 favicon
**Commit:** `afeb98e`

Changed files:
- `client/index.html`
- `client/public/favicon.ico`

Added the official Trading 212 favicon asset from the public Trading 212 website and linked it in the app shell so the browser tab shows the broker icon and stops requesting a missing `/favicon.ico`.

### 2. Polish Positions table display after the Grid refactor
**Commit:** `847912a`

Changed files:
- `client/src/components/PositionsTable.jsx`
- `client/src/pages/HeatmapPage.jsx`
- `client/src/utils/highchartsUtils.js`
- `client/src/utils/tickerUtils.js`

Applied the follow-up display fixes requested after the main table migration:
- switched wallet-currency fields in the Positions table (`Cost`, `Value`, `P/L`, `Div Income`) to GBP-formatted output
- kept instrument-price fields (`Avg Price`, `Price`) as plain numbers so we do not incorrectly label instrument-currency values as GBP
- extracted shared ticker-cleanup helpers so the heatmap and Positions table use the same suffix stripping rules
- added a local Rocket Lab display fallback so stale/pre-merger `VACQ` values render as `RKLB` when the instrument name matches Rocket Lab

---

## Key Findings

- The Trading 212 favicon fix was purely a shell asset problem, not an app logic issue. Once the icon file existed under `client/public`, the remaining browser-console error disappeared.
- Wallet-impact values from the Trading 212 positions payload are in the account’s primary currency, so GBP belongs on `Cost`, `Value`, `P/L`, and dividend totals, but not automatically on instrument-price columns.
- The heatmap’s frontend logic only cleaned ticker suffixes. The Rocket Lab `VACQ → RKLB` behavior in the heatmap comes indirectly from the server-side Yahoo fallback, so the Positions table needed its own local display fallback rather than a straight copy-paste of the heatmap component code.
- Pulling ticker cleanup into a shared utility reduces drift between the heatmap and the Positions table and makes future ticker-display fixes much smaller.

---

## Deviations from the Original Requests

1. The Rocket Lab fallback was implemented as a local display rule in `tickerUtils.js` instead of making the Positions table call Yahoo or reuse the server heatmap route.
Reason: the request was about table display, and a local fallback keeps the fix small, immediate, and free of extra network coupling.

2. This retro includes the favicon change even though that task originally did not require a retro.
Reason: this document is meant to wrap up the small fixes that landed after the main refactor, so it is more useful if it records all of them together.

---

## Issues Encountered

- None in the code itself.
- The only recurring development noise was the existing Vite chunk-size warning during production builds; it does not block the app from building successfully.

---

## Current State

- Working tree clean after the retro commit.
- Post-refactor small-fix files touched:
  `client/index.html`
  `client/public/favicon.ico`
  `client/src/components/PositionsTable.jsx`
  `client/src/pages/HeatmapPage.jsx`
  `client/src/utils/highchartsUtils.js`
  `client/src/utils/tickerUtils.js`
  `docs/retros/2026-04-22-post-refactor-fixes.md`
- `npm.cmd run build` works from the repo root.
- Browser verification was completed for:
  - favicon visible in the tab
  - GBP symbols visible in the correct Positions table columns
  - ticker cleanup working in the Positions table, including Rocket Lab displaying as `RKLB`

---

## Next Step

Resume the remaining Highcharts migration work, with `DividendHistoryTable.jsx` still the most direct next table conversion if you want to continue the Grid migration path.
