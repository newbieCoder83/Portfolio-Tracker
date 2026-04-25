# Drift Findings and Conclusion

Date: 2026-04-25

## Summary

The total-return reconstruction is now accurate enough for this personal portfolio tracker. The latest raw reconstructed account value is within about 0.04% of the Trading 212 account summary, and the main diagnostics are clean:

- No mismatched holdings
- No stale holdings
- No missing prices
- No fill-price estimates
- Cached historical prices are still used for known delisted symbols: ANSS, DARK, MAXR, and STOR

The remaining historical drift is small and mostly old. It is not worth chasing further unless a future chart point becomes visually misleading, exceeds roughly 2%, or a specific date and position has clear evidence that points to one fix.

## Current Numbers

Latest state after the account-value drift fixes:

- Trading 212 summary value: about GBP 142,173.49
- Raw reconstructed value: about GBP 142,229.28
- Difference: about GBP 55.79, or 0.04%

Historical spot-checks still have some drift:

| Date | T212 account value | Reconstructed value | Difference | Difference % |
|---|---:|---:|---:|---:|
| 2020-11-01 | 7,480.95 | 7,374.49 | -106.46 | -1.42% |
| 2021-11-01 | 28,097.77 | 27,931.34 | -166.43 | -0.59% |
| 2024-10-01 | 66,080.46 | 65,374.17 | -706.29 | -1.07% |
| 2025-06-04 | 93,310.01 | 93,700.59 | +390.58 | +0.42% |

These differences are acceptable for the app's current purpose: showing the broad account-value trend against net deposits.

## Why Exact Historical Values Are Hard

Trading 212 provides the current account summary through the public API, plus historical events such as orders, dividends, transactions, and export reports. It does not provide a clean historical daily account-value summary endpoint.

Because of that, old account values have to be reconstructed from:

- Trading 212 export rows
- Orders, dividends, and cash transactions
- Yahoo prices
- FX rates
- Stock splits and corporate actions
- Manually imported historical prices for delisted symbols

That reconstruction can get very close, but it will not always exactly match Trading 212's own historical account view. Differences can come from price timing, FX timing, corporate-action handling, delisted-symbol prices, or statement/accounting details that are not exposed through the API.

## Anchor Behaviour

The regular Dashboard total-return chart anchors only the latest point to the current Trading 212 account summary. That anchor is not saved permanently to the historical date.

For example, if 2026-04-25 is the latest point, the Dashboard chart can adjust that final point to match Trading 212 exactly. When a later trading day is added, 2026-04-25 becomes a normal reconstructed historical point again, and the new latest day receives the anchor.

The raw diagnostic page showed the unanchored reconstruction, but that page has now been disabled from the app UI.

## What Was Preserved

The raw total-return page was removed from active routing and navigation, but its source files remain in the repo:

- `client/src/pages/RawTotalReturnPage.jsx`
- `client/src/components/RawTotalReturnChart.jsx`

The backend diagnostic tools also remain available for future debugging:

- `GET /api/history/total-return-raw`
- `POST /api/history/historical-prices/refresh`
- `server/scripts/diagnoseDriftAtDates.js`

To restore the raw page later, re-add the `RawTotalReturnPage` import and `/total-return` route in `client/src/App.jsx`, then re-add the `Total Return` tab in `client/src/components/Layout.jsx`.

## Snapshot Decision

Keep saving daily Trading 212 snapshots during sync.

Those snapshots are valuable even if the app does not use all of them today. They are the best available local record of real Trading 212 account values going forward, and they can be used later to compare or correct reconstructed values without needing Trading 212 to provide historical account summaries.

The current sync flow already stores one snapshot per day in the `snapshots` table when a sync runs. That behavior should remain in place.

## When To Reopen This

Reopen drift work only if one of these happens:

- A historical chart point becomes visually misleading.
- Drift exceeds roughly 2%.
- A specific date and position has a clear Trading 212 value that can be compared against the diagnostic output.
- A new corporate action creates a mismatched holding or stale holding.

Otherwise, stop here. The current result is accurate enough for personal portfolio tracking, and further work is likely to cost more time and model usage than it returns in practical value.
