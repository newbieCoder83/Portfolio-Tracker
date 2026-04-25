# Account Value Drift Fix Retro
**Date:** 2026-04-25
**Branch:** `Highcharts-Refactor`

---

## What Was Done

### 1. Add an opt-in trace hook to the total-return reconstruction
**Commit:** Not committed yet

Changed files:
- `server/services/totalReturnService.js`

`buildTotalReturnHistory` and `buildImportedTotalReturnHistory` now accept a `traceDates` option (array or `Set` of `YYYY-MM-DD`). When provided, the response includes a `diagnostics.trace` block with a per-date snapshot for each requested date and a top-level `priceSeriesSummary` for every held key.

The per-date snapshot reuses the live daily walk: `calculateImportedMarketValue` accepts an optional `contributionCollector` that fills in one row per held key while it walks holdings. There is no second pass over `state`, so the trace is guaranteed to match the chart's own values and does not double-mutate `lastPrices`/`lastFxRates`/`lastFallbackPrices`.

Each contribution row records `key`, `ticker`, `currency`, `quantity` (current-share basis when the price series is Yahoo-backed), `selectedPrice`, `priceSource` (`yahoo|cached|fillFallback|missing`), `fxRate`, `gbpValue`, and source flags (`pricesAreSplitAdjusted`, `historicalFromCache`, `estimatedFromFillsOnly`).

The `priceSeriesSummary` exposes per-key `splitsByDate` entries (date → factor — source attribution per split is *not* yet tracked because `mergeSplitMaps` collapses sources, and adding it would require a deliberate change to that function), `pricesAreSplitAdjusted`, `historicalFromCache`, `estimatedFromFillsOnly`, and any `failureMessage` from `buildExportPriceSeries`.

Default callers (the Dashboard chart and `/api/history/total-return-raw`) pass no `traceDates`, so their response shape is unchanged.

### 2. Add a read-only diagnostic harness
**Commit:** Not committed yet

New file:
- `server/scripts/diagnoseDriftAtDates.js`

Standalone Node script run with `node server/scripts/diagnoseDriftAtDates.js`. Calls `buildTotalReturnHistory({ skipReconciliation: true, traceDates: [...] })` once and prints:

- A baseline table comparing reconstructed `totalValue` to user-supplied T212 values for the four historical spot-check dates plus the latest reconstructed date.
- For each target date: cash, market value, net deposits, total value, per-position contributions sorted by absolute GBP value, and the events that landed on that date.
- An applied-split summary per held key.
- Lists of fill-fallback, cached, and Yahoo-failure tickers.
- Corporate-action diagnostics (which Yahoo splits were ignored for quantity, which ones were kept, etc.).

The harness does **not** rebuild the holdings/pricing walk — it consumes only `diagnostics.trace`.

### 3. Classify the Honeywell / Solstice spin-off
**Commit:** Not committed yet

Changed files:
- `server/services/totalReturnService.js`

Added `HON_US_EQ` and `HON` entries to `KNOWN_CORPORATE_ACTIONS_BY_TICKER` for `2025-10-30` with type `SPIN_OFF_OR_PRICE_ADJUSTMENT`. The Trading 212 export already contains the real `Stock distribution` row for SOLS on `2025-10-31`, so no synthetic distribution event was added.

`filterQuantitySplitMap` now skips the spin-off "split" Yahoo records on 2025-10-30 (factor 1.061) for quantity back-conversion. This removes the persistent 1.0548× over-count of HON shares at the latest reconstructed date.

### 4. Undo Yahoo's pre-event price adjustment for spin-off / price-adjustment events
**Commit:** Not committed yet

Changed files:
- `server/services/totalReturnService.js`

Yahoo back-adjusts pre-split close prices for every event in `events.splits`, including spin-offs. For spin-offs the parent share count does not change, so when `filterQuantitySplitMap` skips them for quantity back-conversion, Yahoo's price adjustment alone leaves pre-event values understated by the spin-off factor.

In `buildExportPriceSeries`, after building `pricesByDate` from quotes, any Yahoo split whose date is classified as `SPIN_OFF_OR_PRICE_ADJUSTMENT` for the current ticker now has its factor multiplied back into pre-event prices, recovering the actual close. Ordinary splits keep Yahoo's adjustment because their quantity back-conversion compensates.

This affects the previously-classified spin-offs too: O / Realty Income (2021-11-15, factor 1.032) and PFE / Viatris (2020-11-17, factor 1.054). Pre-event historical values for those tickers were also being understated; they are now correct.

---

## Key Findings

- The latest 0.33% over-bias was almost entirely the HON SOLS spin-off being interpreted as a quantity split. Track A drops it to ~0.05%.
- For pre-spin-off historical dates, classifying the event as `SPIN_OFF_OR_PRICE_ADJUSTMENT` without also unwinding Yahoo's price adjustment **shifts** the bias from "over by F" (post-event) to "under by F" (pre-event). Both fixes have to land together.
- Yahoo's `events.splits` for the user's portfolio includes several spin-offs / non-split corporate actions that Yahoo encodes as splits: 3M / Solventum (2024-04-01, factor 1.196), AT&T / Warner Bros Discovery (2022-04-11, factor 1.324), Western Digital / SanDisk (2025-02-24, factor 1.323), Unilever / Magnum (2025-12-09, factor 0.889 — likely a real share consolidation rather than a price-only adjustment, so handle case-by-case). They were not classified in this retro because the user did not hold the parent at the relevant dates of interest, and the historical math cancels for through-period holdings; they remain candidates if user-supplied per-position values reveal further drift.
- Without per-position T212 statement values for the historical spot-check dates, the residual drift on 2024-10-01 (-£706, -1.07%) and 2025-06-04 (+£391, +0.42%) cannot be attributed to a specific position. Possible causes include a single-position price discrepancy, a Trading 212 cash-side timing difference, or an unhandled corporate action affecting a position the user no longer holds.

---

## Verification

- `node --check server/services/totalReturnService.js` passed.
- `node --check server/scripts/diagnoseDriftAtDates.js` passed.
- Pre-fix baseline captured via `node server/scripts/diagnoseDriftAtDates.js`. Post-fix harness re-run; deltas below.
- `npm run build` from the repo root passed; existing Vite large-chunk warning unchanged.
- Confirmed `GET /api/history/total-return-raw` (no `traceDates`) response shape is unchanged — `diagnostics.trace` is absent for non-tracing callers.

### Before / after table

| Date | T212 AV | Pre-fix Reconstr | Post-fix Reconstr | Pre-fix Δ% | Post-fix Δ% |
|---|---|---|---|---|---|
| 2020-11-01 | 7480.95 | 7354.41 | 7374.49 | -1.69% | -1.42% |
| 2021-11-01 | 28097.77 | 27912.43 | 27931.34 | -0.66% | -0.59% |
| 2024-10-01 | 66080.46 | 65374.17 | 65374.17 | -1.07% | -1.07% |
| 2025-06-04 | 93310.01 | 93700.59 | 93700.59 | +0.42% | +0.42% |
| 2026-04-25 (latest) | 142165.18 | 142567.68 | 142229.28 | +0.28% | +0.05% |

`mismatchedHoldingCount: 1 → 0`. `staleHoldingCount: 0 → 0`. `estimatedSymbols: [] → []`. `historicalPriceSymbols: [ANSS, DARK, MAXR, STOR]` unchanged.

---

## Current State

- The latest reconstructed value is within 0.05% of the Trading 212 account summary (the existing 2% gate now passes comfortably).
- HON is no longer flagged as a mismatched holding.
- Pre-spin-off historical dates for HON, O, and PFE are now reconstructed without Yahoo's spin-off price drag.
- Historical drift at 2024-10-01 and 2025-06-04 is unchanged from baseline because no spin-off classification applies to those dates' currently-held positions.

---

## Remaining Risks / Next Step

- Per-date drift on 2024-10-01 and 2025-06-04 is roughly ±1%. Without per-position T212 statement values for those dates I cannot point the next fix at a specific position.
  - Suggested follow-up: at one of those dates, capture each held position's T212 web-statement value and feed it into a future enhancement of the harness. The largest-gap position will dictate the next fix.
- Yahoo's `events.splits` for tickers the user has held but currently no longer holds includes several spin-offs / pseudo-splits (3M, AT&T, WDC, Unilever). If the user ever re-buys one of those tickers, classification entries should be added so the spin-off is not back-converted.
- The `mergeSplitMaps` flattening of split source attribution (manual / Yahoo / derived) is preserved; if a future debugging pass needs to know which source provided a given split, that helper would need to retain `{factor, source}` rather than just `factor`.
- The local untracked `server/query.js` diagnostic scratch file was not modified or committed.
