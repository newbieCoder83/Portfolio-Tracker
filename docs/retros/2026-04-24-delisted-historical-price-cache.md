# Delisted Historical Price Cache Retro
**Date:** 2026-04-24
**Branch:** `Highcharts-Refactor`

---

## What Was Done

### 1. Add a reusable historical price cache
**Commit:** Not committed yet

Changed files:
- `server/db/schema.js`
- `server/services/historicalPriceService.js`
- `server/services/totalReturnService.js`

Added a `historical_prices` SQLite table for daily close prices keyed by instrument/date/source. The instrument key prefers ISIN (`isin:...`) when available, which is safer than ticker-only matching for renamed or delisted holdings.

The total-return reconstruction now tries prices in this order:
1. Yahoo historical chart data
2. Cached historical prices from `historical_prices`
3. Existing fill-price fallback

This keeps the old fallback behavior but gives delisted holdings a better data source when Yahoo has nothing.

### 2. Add manual Excel / CSV import for historical prices
**Commit:** Not committed yet

Changed files:
- `server/scripts/importHistoricalPrices.js`

Added a small import script that can import one or more files:

```powershell
node server/scripts/importHistoricalPrices.js --source manual --file path/to/prices.xlsx
```

Required columns are `date`, `close`, `currency`, and either `isin` or `ticker`. For the four supplied files, the importer now applies filename metadata automatically:

- `ANSS historical.xlsx` -> `ANSS_US_EQ`, `US03662Q1058`
- `DARK Historical.xlsx` -> `DARKl_EQ`, `GB00BNYK8G86`
- `STOR Historical.xlsx` -> `STOR_US_EQ`, `US8621211007`
- `MAXR Historical.xlsx` -> `MAXR_US_EQ`, `US57778K1051`

The script supports `--dry-run`, which validates the files and reports parsed/skipped rows without writing to SQLite.

Prices in `GBX`/`GBp` are converted to `GBP` before storage.

Excel serial dates are parsed as spreadsheet calendar dates, not UTC instants. This matters because the ANSS file contains `04/06/2021`; treating the cell as a timestamp shifted it to `2021-06-03` during early inspection.

### 3. Repurpose the raw chart refresh button
**Commit:** Not committed yet

Changed files:
- `server/routes/history.js`
- `client/src/components/RawTotalReturnChart.jsx`
- `CLAUDE.md`

Added `POST /api/history/historical-prices/refresh`, which asks TwelveData `/time_series` for only the symbols currently shown as fill-price fallback symbols on the raw chart.

The raw chart button now says `Refresh historical prices`, sends the displayed fallback tickers, and shows a separate `Cached historical prices` diagnostic chip/list.

The old TwelveData corporate-actions route and `corporate_actions` table remain available, but the raw chart no longer uses that button for `/splits`.

---

## Key Findings

- TwelveData `/time_series` is free as an endpoint, but the current Basic key did not return usable data for the four delisted targets during smoke testing.
- The reliable path for `ANSS`, `DARK`, `STOR`, and `MAXR` is therefore manual CSV import into `historical_prices`.
- Local data shows the four target holdings are closed positions, so this work should improve the historical chart shape while those positions were held. It is not expected to materially reduce the latest account-value delta.
- The Trading 212 export already includes `Interest on cash` rows, and the imported total-return path treats those as cash income rather than deposits.

---

## Verification

- `node --check server/services/historicalPriceService.js` passed.
- `node --check server/scripts/importHistoricalPrices.js` passed.
- `node --check server/services/totalReturnService.js` passed.
- `node --check server/routes/history.js` passed.
- Initial CSV importer dry-run parsed 4 sample rows, skipped 0, and imported 0 because `--dry-run` was used.
- Real four-file dry-run parsed 1,206 rows, skipped 0, and confirmed filename metadata was applied to all four files.
- Real import inserted 1,206 manual historical price rows.
- Cache verification showed `DARKl_EQ` GBX prices were stored as GBP, for example `2021-12-16` close `411 GBX` became `4.11 GBP`.
- Raw total-return smoke test after import returned `points: 2139`, `estimatedSymbols: []`, `historicalPriceSymbols: [ANSS_US_EQ, DARKl_EQ, MAXR_US_EQ, STOR_US_EQ]`, and `delta: 3.43`.
- `npm run build` passed. The existing Vite large-chunk warning still appears.

---

## Current State

- Real historical close files have been imported for all four delisted symbols.
- The four delisted symbols now appear under `historicalPriceSymbols` instead of `estimatedSymbols`.
- TwelveData refresh is still useful where the Basic plan has coverage, but it should be treated as opportunistic rather than guaranteed for delisted holdings.

---

## Next Step

Reload `/total-return` and visually check that the diagnostics show cached historical prices for the four imported delisted symbols.
