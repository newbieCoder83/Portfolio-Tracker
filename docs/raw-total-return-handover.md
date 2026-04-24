# Raw Total Return Chart — Handover Doc

Target audience: whoever (Codex, another assistant, future-you) picks this up next.

## 1. Executive summary

### What the user asked for

> "All I want is a chart that shows my total return and net deposits as two different lines ... In a separate page, make a new chart. Leave the current one alone. Remove the 'Total return history is unavailable because the latest reconstructed value is more than 2% away from the Trading 212 account summary' warning and blocker. Even if it's wrong I want to see it for testing."

### What shipped

A new page `/total-return` with a simpler two-line chart ("Total value" + "Net deposits"), rendering even when the existing Dashboard chart's 2% reconciliation gate fails. Below the chart is a diagnostics panel that exposes exactly why the reconstruction drifts from Trading 212's own summary.

The existing Dashboard chart ([client/src/components/PortfolioValueChart.jsx](../client/src/components/PortfolioValueChart.jsx)) and its endpoint `GET /api/history/total-return` are untouched — all Dashboard behaviour is preserved.

### Current state (end of session)

- **Reconstructed value:** £137,389
- **T212 summary value:** £142,300
- **Delta:** 3.45%
- **Mismatched holdings:** 1 (HON_US_EQ, ratio 1.055× — small share-dividend / DRIP Yahoo misses)
- **Stale holdings:** ~5 small fractional leftovers (negligible)
- **Fill-fallback tickers (no Yahoo prices):** 4 (STOR, MAXR, DARK, ANSS)

Started at ~21% delta, ended at 3.45%. Most of the remaining gap is the 4 fill-fallback tickers priced at user's historical fill price rather than current market.

---

## 2. Architecture

### Data pipeline (before any changes)

```
T212 API
  /equity/account/summary      ──┐
  /equity/positions            ──┤
  /equity/history/orders       ──┼──► syncService.js ──► SQLite tables
  /equity/history/transactions ──┤                        (account_summary,
  /equity/history/dividends    ──┤                         positions, orders,
  /equity/metadata/instruments ──┘                         transactions,
                                                           dividends, instruments,
                                                           t212_export_rows)
                                     ┌──────────────────────┘
                                     ▼
                      totalReturnService.js
                        buildTotalReturnHistory()
                          - if export rows exist → buildImportedTotalReturnHistory()
                            (uses CSV export + API data + Yahoo prices + splits)
                          - else → API-only reconstruction
                                   (API data + Yahoo prices, NO split support)
                                     │
                                     ▼
                            daily points array
                            [{ date, totalValue, netDeposits, returnValue, returnPct }, ...]
                                     │
                                     ▼
                           GET /api/history/total-return
                                     │
                                     ▼
                            Dashboard PortfolioValueChart
```

### What was added this session

```
                           NEW: buildTotalReturnHistory({ skipReconciliation: true })
                                 - bypasses 2% validation gate
                                 - bypasses final-point T212 anchor
                                 - also bypasses the Excel-path gate when set
                                     │
                                     ▼
                           NEW: GET /api/history/total-return-raw
                                     │
                                     ▼
                           NEW: RawTotalReturnPage → RawTotalReturnChart
                                     │  (two-line chart + diagnostics panel)
                                     ▼
                           NEW: diagnostics panel chips
                                 - Missing prices
                                 - Estimated (fill-fallback)
                                 - Stale holdings
                                 - Mismatched holdings (with ratio col)
                                     │
                                     ▼
                           NEW: "Refresh corporate actions" button
                                 (calls TwelveData splits — ended up paywalled
                                  on free tier, see Section 6)
                                     │
                                     ▼
                           NEW: corporate_actions SQLite table
                                 (caches splits by (ticker, date, source))
                                     │
                                     ▼
                           NEW: merged splitsByDate in buildExportPriceSeries
                                 (DB splits override Yahoo on collision)
```

---

## 3. Chronological walkthrough — what we did and why

### 3.1 Initial request: raw chart bypassing the 2% gate

**Problem:** the Dashboard chart silently refuses to render if the reconstructed latest value is >2% away from T212's summary. The user wanted to see the chart anyway, on a separate page, to diagnose where the error comes from.

**Design:** add a `skipReconciliation` option to `buildTotalReturnHistory()`. When true:
- Don't short-circuit return empty points when the unavailable-reason gate fires.
- Don't overwrite the last point with T212's summary-anchored values.

**Implementation:**
- [server/services/totalReturnService.js](../server/services/totalReturnService.js) — added the option, gated both blockers with `!skipReconciliation`.
- [server/routes/history.js](../server/routes/history.js) — new route `GET /api/history/total-return-raw`.
- [client/src/components/RawTotalReturnChart.jsx](../client/src/components/RawTotalReturnChart.jsx) — NEW. Two Highcharts line series, simpler than the Dashboard's area chart.
- [client/src/pages/RawTotalReturnPage.jsx](../client/src/pages/RawTotalReturnPage.jsx) — NEW. Fetches and renders.
- [client/src/App.jsx](../client/src/App.jsx) — registered `/total-return` route.
- [client/src/components/Layout.jsx](../client/src/components/Layout.jsx) — added "Total Return" tab.

### 3.2 Bug: net deposits line flat at £0 until ~2 months ago

**Observation:** user's chart showed the "Net deposits" line sitting at £0 for most of the 5-year history, then jumping to ~£1,500 only in the last ~2 months.

**Root cause:** T212's `/api/v0/equity/history/transactions` endpoint has a **limited retention window**. The user's DB had transactions going back only to `2026-02-07` — 2.5 months — whereas orders went back to 2020-06-16. So `netDeposits` (accumulated from transaction-type events) started at zero and only picked up when the first known transaction appeared.

**Fix:** extend the API-only reconstruction path with a deposit-backfill from `t212_export_rows`. When `skipReconciliation` is true and the CSV export has been imported, use `Deposit`/`Withdrawal` rows with dates strictly before the earliest API transaction date to populate `netDeposits` (and `cash`). No double-counting on dates that overlap between the two sources.

**Code:** [server/services/totalReturnService.js](../server/services/totalReturnService.js) — `buildEvents` now accepts a `depositFillRows` parameter.

**Note:** this fix became partially obsolete in Section 3.4 when we routed the raw chart through the imported path, which already handles deposits from exports natively. But the backfill code is still useful if the user ever loses their exports and only has API data.

### 3.3 Bug: 21% delta between reconstruction and T212 summary

**Investigation:** wrote read-only SQLite queries to diagnose what was off. Result: **13 mismatched holdings worth £112,438 of current value — 78.7% of the portfolio**. Ratios were messy (NVDA 0.49×, AVGO 0.38×, LRCX 0.39×, BILI 0.39×, etc.) — not clean split factors, which suggested splits + DRIP + corporate distributions compounded.

Also confirmed:
- T212's API `/history/orders` endpoint returns `fill_type = STOCK_SPLIT` / `STOCK_DISTRIBUTION`, but in the user's DB only **3 rows in 5 years**. NVDA, AVGO, TSLA, GOOG, LRCX splits all silently omitted.
- T212's CSV export is similar: 1 `Stock split open`, 1 `Stock split close`, 1 `Stock distribution` in 5,385 rows.
- User's API transactions table contained only 50 rows going back 2.5 months.
- User's `t212_export_rows` table has 5,385 rows going back to 2020-06-16 including 366 deposits and 18 withdrawals — full deposit history is captured there.

**Fix:** the existing `buildImportedTotalReturnHistory` path (Excel-export path) already handles splits via `applySplitEvents` using Yahoo split data, AND pulls deposits from the export rows. The previous plan had explicitly routed AWAY from that path when `skipReconciliation: true`. Reversed that decision.

Also threaded `skipReconciliation` into `buildImportedTotalReturnHistory` so it bypasses its own validation gate (which checks 4 things: 2% delta, position-value delta, unrealised-PL delta, net-deposits anchor delta).

**Code:** [server/services/totalReturnService.js](../server/services/totalReturnService.js)

Delta dropped from **21% → 9%** and mismatched holdings from **13 → 9**.

### 3.4 Bug: 9 mismatched holdings, all Reconstructed=0

The user shared a screenshot of the diagnostics table. All 9 rows had `Reconstructed: 0` and `Ratio: —`, and the stale list contained 14 tickers — several of them exact quantity matches to the mismatched entries:

| Mismatched (Reconstructed=0) | Stale (same quantity) |
|---|---|
| AVGO_US_EQ 42.428043 | 1YDd_EQ 42.428043 |
| AXP_US_EQ 20.152742 | AEC1d_EQ 20.152742 |
| CRWD_US_EQ 28.276643 | 45Cd_EQ 28.276643 |
| HON_US_EQ 39.222138 | ALDd_EQ 39.222138 |
| INTC_US_EQ 124.086242 | INLd_EQ 124.086242 |
| MU_US_EQ 17.065194 | MTEd_EQ 17.065194 |
| NET_US_EQ 109.039845 | 8CFd_EQ 109.039845 |
| VACQ_US_EQ 76.332376 | 6RJd_EQ 76.332376 |

**Root cause:** T212 renames tickers over time (e.g. `1YDd_EQ` → `AVGO_US_EQ`), but the ISIN is stable. The imported path correctly keys holdings internally by ISIN (`isin:US09857L1089`), but `buildHoldingDiagnostics` was comparing by ticker string, so renamed tickers produced phantom pairs for the same underlying holding.

**Fix:** before calling `buildHoldingDiagnostics`, resolve each held ISIN to the T212 ticker used in the current `positions` table. Code at [totalReturnService.js lines ~1495-1515](../server/services/totalReturnService.js).

Phantom mismatches 9 → 1 (the single remaining one was LRCX at 0.372×, a real split issue).

### 3.5 Investigation: can free feeds give us the missing splits?

Researched data providers. Summary matrix:

| Provider | Free tier | UK coverage | Splits endpoint on free? |
|---|---|---|---|
| Yahoo Finance (`yahoo-finance2`) | Unlimited | Yes | Yes (via `chart.events.splits`) |
| TwelveData | 800/day, 8/min | Yes (LSE) | **Paywalled (Grow+)** — discovered at runtime, see 6.1 |
| FMP | 500MB/mo | UK is paid Premium | Yes on free |
| EODHD | Very restricted | Limited | Contact-support for historical |
| Polygon.io | US only | No | Yes |
| Alpaca | US only | No | Yes |

**Design choice:** add TwelveData as a backup corporate-actions feed on top of Yahoo. New schema, service, route, button. This turned out to be a dead end because TwelveData paywalled `/splits` — see Section 6.

### 3.6 Bug: the splits ARE in Yahoo but not being applied

After TwelveData failed, we noticed the user still had LRCX mismatched. Ran a minimal test that called Yahoo's `chart()` directly for LRCX and got back:

```
events.splits: [{"date":"2024-10-03T...","numerator":10,"denominator":1,"splitRatio":"10:1"}]
```

Yahoo WAS returning the split. Added debug logging inside `applySplitEvents` to see what the production path saw on `2024-10-03`:

```
key=isin:US5128073062 splitsByDateSize=0 factor-on-date=undefined ...
```

LRCX's price series had an empty `splitsByDate`. Added further debug to `buildExportPriceSeries` — the mystery unlocked:

```
[DEBUG] info.t212Ticker = 'LAR0d_EQ' (NOT LRCX_US_EQ!)
candidates = ['LAR0.DE', 'LRCX']
yahooTicker = LAR0.DE → yahooSplits = []  (function returned here, never tried LRCX)
```

**Root cause: multi-listing collision.**
- LRCX (US listing, `LRCX_US_EQ`) and the thinly-traded Frankfurt listing of Lam Research (`LAR0d_EQ`) **share ISIN `US5128073062`**.
- `buildInstrumentLookup` was iterating `instruments → orders → positions` and using **first-write-wins** by ISIN.
- T212's instruments table apparently had `LAR0d_EQ` first, so it claimed the ISIN slot before the position's `LRCX_US_EQ` could register.
- The Yahoo candidate list then led with `LAR0.DE`, which returned sparse German-listing data (no split events recorded), succeeded on the first try, and the loop exited before `LRCX` was attempted.

**Fix:** reverse the iteration order to `positions → orders → instruments` (keeping first-write-wins). Positions tells us which listing the user actually holds, so resolving by position first is correct.

**Code:** [server/services/totalReturnService.js](../server/services/totalReturnService.js) — `buildInstrumentLookup`.

Delta dropped from **9% → 3.45%**.

---

## 4. Files changed (complete list)

### Backend

- [server/db/schema.js](../server/db/schema.js) — added `corporate_actions` table: `(ticker, action_date, action_type, factor, source, fetched_at)` keyed on `(ticker, action_date, source)`. Allows storing Yahoo / TwelveData / manual override splits side-by-side for audit. Indexed on `ticker`.

- [server/services/totalReturnService.js](../server/services/totalReturnService.js) — biggest file, multiple edits:
  - `buildTotalReturnHistory` now accepts `{ skipReconciliation }` and threads it into the imported path.
  - `buildImportedTotalReturnHistory` accepts `skipReconciliation` and bypasses its four-failure gate + final-point anchor override when set.
  - `buildEvents` accepts `depositFillRows` for API-only path backfill from export CSV (Section 3.2).
  - `buildHoldingDiagnostics` now returns ticker-level detail arrays (`staleHoldings`, `mismatchedHoldings`) alongside the counts, so the UI can show what's actually wrong.
  - Before calling `buildHoldingDiagnostics` in the imported path, holdings (keyed by `isin:XXX`) are resolved to the canonical ticker from `positions` via ISIN matching (Section 3.4).
  - `buildInstrumentLookup` iteration order reversed to `positions → orders → instruments` (Section 3.6).
  - `buildExportPriceSeries` now merges `getChartSplitsByDate(chart)` (Yahoo) with `getMergedSplitsByDate(t212Ticker)` (DB cache). DB-cached splits win on collision (manual > twelvedata > yahoo priority).

- [server/services/corporateActionsService.js](../server/services/corporateActionsService.js) — NEW. TwelveData client, cache, and merge helper. Exports:
  - `refreshSplitsForTickers(tickers, { maxAgeDays })` — batch fetch with rate-limit throttling (200 ms spacing). Skips tickers fetched within `maxAgeDays`.
  - `getMergedSplitsByDate(ticker)` — reads cached splits with source priority (manual > twelvedata > yahoo).
  - `t212ToTwelveDataSymbol(ticker)` — maps T212 tickers to TwelveData's `SYMBOL:EXCHANGE` format via Yahoo-normalized intermediate.
  - Freshness tracking via `sync_state` keys like `corporate_actions_fetched:twelvedata:LRCX_US_EQ`.

- [server/routes/history.js](../server/routes/history.js) — three additions:
  - `GET /api/history/total-return-raw` — calls `buildTotalReturnHistory({ skipReconciliation: true })`.
  - `POST /api/history/corporate-actions/refresh?force=1` — manual TwelveData refresh.
  - Both require auth (the router is mounted under `requireAuth`).

- [server/index.js](../server/index.js) — added `require('dotenv').config()` as first line so env vars load from `server/.env`.

- [server/package.json](../server/package.json) — added `dotenv` dep.

### Frontend

- [client/src/components/RawTotalReturnChart.jsx](../client/src/components/RawTotalReturnChart.jsx) — NEW. Simpler Highcharts two-line chart. Diagnostics panel with chips, missing/estimated symbols lists, mismatched-holdings table, stale-holdings list. "Refresh corporate actions" button with "Force re-fetch all" Switch.

- [client/src/pages/RawTotalReturnPage.jsx](../client/src/pages/RawTotalReturnPage.jsx) — NEW. Fetches `/api/history/total-return-raw`, renders the chart, passes `fetchData` down as `onRefreshComplete`. `fetchData` takes an `{ initial: true }` option — only the initial call sets `loading=true` (prevents the chart unmounting and wiping the local refresh alert state on subsequent refetches).

- [client/src/App.jsx](../client/src/App.jsx) — registered `/total-return` route with `ProtectedRoute`.

- [client/src/components/Layout.jsx](../client/src/components/Layout.jsx) — added "Total Return" tab.

### Config / docs

- [server/.env](../server/.env) — NEW (gitignored). Holds `TWELVEDATA_API_KEY`.
- [CLAUDE.md](../CLAUDE.md) — added "Environment variables" section documenting `TWELVEDATA_API_KEY`.
- [docs/raw-total-return-handover.md](./raw-total-return-handover.md) — this file.

---

## 5. Key logic to understand

### 5.1 `applySplitEvents` (vs adjclose prices)

Yahoo's `chart()` returns `adjclose` (split/dividend-adjusted) and `close` (raw) in the quotes. The codebase uses `adjclose ?? close`. On split day, Yahoo's `adjclose` is already retroactively-adjusted to reflect post-split equivalence. If we ALSO multiply our share count by the split factor, we effectively double-apply the split.

Practical effect for LRCX (10:1, 2024-10-03):
- At the latest date (today): `adjclose` equals raw close (no future split to adjust for), and our post-split share count equals T212's actual count. Latest-date value is correct.
- At historical dates pre-split: `adjclose` is one-tenth of the raw close (back-adjusted). If our reconstruction held 1 share at that time, we compute 1 × $100 = $100 — but the user's actual value that day was 1 × $1000 = $1000. **Historical values are under-represented by the cumulative future-split factor.**

This is a known artefact of using adjclose. It doesn't affect the latest-date delta (the main accuracy metric) but does distort the shape of the historical line. Using `close` (raw) instead of `adjclose` would fix historical accuracy but break dividend handling because adjclose also accounts for dividend reinvestment. Dedicated corporate-actions tables (splits + dividends) would be the clean fix.

### 5.2 Source priority in `corporate_actions` table

`getMergedSplitsByDate(ticker)` reads all rows for a ticker and collapses by `action_date`, keeping the highest-priority source:

```
manual (3) > twelvedata (2) > yahoo (1)
```

The returned `Map<date, factor>` is then merged with Yahoo's in-request chart splits in `mergeSplitMaps`, where the DB-cached value wins on collision. Net effect: a user who manually inserts a correct split factor can override anything Yahoo or TwelveData reported.

No UI for inserting manual overrides yet — would require a separate endpoint / form. Could be a direct SQL insert for now.

### 5.3 Instrument priority in `buildInstrumentLookup`

This is the fix from Section 3.6 — the most impactful bug of the session. Iteration order is now:

```js
positions → orders → instruments  // first-write-wins per ISIN
```

If you ever add a new source of instrument metadata (e.g. corporate actions, splits), be careful about where it slots in. Generally: the most user-specific source (what they hold) should win.

### 5.4 Diagnostics display resolution

The imported path keys holdings by `isin:XXX`. The diagnostics panel compares by ticker. Before calling `buildHoldingDiagnostics`:

1. Build `positionsByIsin` from the user's positions table.
2. For each `(key, qty)` in `state.holdings`, extract the ISIN from the key or `instrumentsByKey[key].isin`.
3. Use `positionsByIsin.get(isin)?.ticker` if available, falling back to `instrumentsByKey[key].t212Ticker`.
4. That gives us a ticker-keyed holdings map where ticker names match the positions table — so diagnostics don't false-alarm on renames.

### 5.5 Deposit backfill from export rows (API-only path)

In `buildEvents`, if `depositFillRows` is passed (only when `skipReconciliation` is true and exports exist — and only if we DIDN'T route through the imported path, which is rare), iterate `Deposit` / `Withdrawal` rows where `date < earliestTransactionDate` and emit them as synthetic `transaction`-type events. Both `cashAmount` and `netDepositAmount` are contributed so the cash balance also heals.

---

## 6. Dead ends and lessons

### 6.1 TwelveData `/splits` is paywalled on the free tier

Pre-flight research (web searches of TwelveData pricing pages) suggested `/splits` was included in the free tier. Runtime testing revealed otherwise:

```
/splits is available exclusively with grow or pro or ultra or venture or
enterprise plans. Consider upgrading your API Key now at
https://twelvedata.com/pricing
```

Lesson: for any third-party integration, do a five-minute smoke test (literally curl the endpoint with a free key) before investing in architecture. Marketing copy and docs don't always reflect current tier boundaries.

The code (service, route, button, table, `.env` key plumbing) is still in place and functional — just returns `failed: 100` with the error message on every click. Three options going forward:
1. **Leave** — zero-cost future-proofing if you ever upgrade.
2. **Remove** — Section 5 in "Next steps" has a cleanup list.
3. **Repurpose for `/time_series`** — that endpoint IS free on TwelveData's basic tier. Could close most of the remaining 3.45% by replacing the 4 fill-fallback tickers' fill-price proxies with real historical prices. See Section 8.

### 6.2 Refresh button alert kept disappearing

The Refresh button triggered `onRefreshComplete()`, which called `fetchData()` on the page, which set `loading=true`, which unmounted the entire chart (replaced by a full-screen spinner), which wiped the chart's local `refreshState` that held the success/error alert.

Fix: `fetchData({ initial })` with `initial` defaulting to false. Only the initial mount sets `loading=true`. Subsequent refetches leave the chart mounted and update `totalReturn` underneath.

### 6.3 Confusing the `Date` object vs ISO string

When debugging the LRCX split flow, I wrote a test that used `String(splitDate).slice(0, 10)` on a JavaScript `Date` object and got `'Thu Oct 03'` instead of `'2024-10-03'`. Momentary panic about a date-format bug in production code — but production uses `toDateKey(value)` which internally does `new Date(value).toISOString().slice(0, 10)`, which is correct.

Lesson: when JSON.stringify is involved, Date objects render as ISO strings but their actual `.toString()` uses locale format. Always check the type, not the serialised output.

---

## 7. What the user should verify after handover

1. **Reload `/total-return` in the browser.** Expect delta ~3.45%, mismatched count 1 (HON), stale count ~5, fill-fallback count 4.
2. **Sanity-check the Dashboard.** The original `PortfolioValueChart` should be unchanged. If T212's 2% gate is still being tripped on the Dashboard (which it likely is, since reconstruction is 3.45% off), the Dashboard will show the "Total return history is unavailable..." message — this is expected and intentional. Only `/total-return` bypasses it.
3. **Query the DB directly to confirm listing-priority fix landed.**
   ```sql
   -- Open data/portfolio.db via better-sqlite3 or any SQLite client
   SELECT p.ticker AS position_ticker, i.ticker AS instrument_ticker, p.instrument_isin
   FROM positions p
   JOIN instruments i ON i.isin = p.instrument_isin
   WHERE p.ticker != i.ticker;
   ```
   If this returns rows, you have multi-listing instruments. Any row where the imported path might previously have picked the wrong ticker is now resolved to the position's ticker — confirm visually by clicking around the Total Return page; those tickers should no longer be in fill-fallback or mismatched.

4. **Smoke-test the Refresh button.** Click it. Expect alert reading:
   ```
   Fetched 0, cached 1 skipped, failed 99 — ~30s
   ```
   (Because TwelveData paywalled `/splits` — failures are expected. If you see `fetched > 0`, something unexpected happened. If you see `failed: 0, cached: 100`, you're hitting the 30-day-stale cache which is intentional.)

5. **Verify the `server/.env` key is still rotated.** It was pasted in plaintext during the session twice — see the security note at end of this doc.

---

## 8. Recommended next steps (ordered by impact / effort)

### 8.1 HIGH impact / LOW effort: fix the HON 5.5% over-count

HON is the one remaining real mismatch (41.37 reconstructed vs 39.22 T212 actual). Likely a share-based dividend or DRIP Yahoo missed. Two options:

- **Fastest:** add a manual override row to `corporate_actions`:
  ```sql
  INSERT INTO corporate_actions (ticker, action_date, action_type, factor, source, fetched_at)
  VALUES ('HON_US_EQ', '<date>', 'SPLIT', 39.22/41.37, 'manual', datetime('now'));
  ```
  Pick a date that makes sense — the day of the misbooked corporate action. This scales HON's reconstructed holdings down to match.
- **Better:** figure out WHAT event T212 processed that Yahoo missed (check [Honeywell's investor relations page](https://investor.honeywell.com) for corporate actions). Document it, then insert the real factor.

Expected delta drop: ~0.3-0.5%.

### 8.2 HIGH impact / MEDIUM effort: historical prices for the 4 fill-fallback tickers

STOR (STORE Capital), MAXR (Maxar Technologies), DARK (Darktrace), ANSS (ANSYS) all return "symbol may be delisted" from Yahoo. The reconstruction falls back to the user's fill price — frozen at purchase time — which is stale. All four have appreciated or depreciated since purchase, so the reconstruction under- or over-values them.

Fix options:

- **TwelveData `/time_series`** — free tier, 1 credit per call regardless of outputsize. For 4 tickers × one-time backfill = 4 credits. Incremental daily updates = 4 credits/day. Sustainable.
- **Alpha Vantage free tier** — 5 calls/min, 500 calls/day. Works.
- **Manual anchor** — look up current prices, insert a daily `close_price` override manually. Not scalable but fastest.

New schema (same pattern as `corporate_actions`):

```sql
CREATE TABLE historical_prices (
  ticker      TEXT NOT NULL,
  source      TEXT NOT NULL,  -- 'yahoo' | 'twelvedata' | 'manual'
  bar_date    TEXT NOT NULL,
  close       REAL,
  currency    TEXT,
  fetched_at  TEXT NOT NULL,
  PRIMARY KEY (ticker, source, bar_date)
);
CREATE INDEX idx_hp_ticker_date ON historical_prices(ticker, bar_date);
```

Wire it into `buildExportPriceSeries` / `buildPriceSeries`: after Yahoo, fall back to this table. Incremental maintenance: on each reconstruction, fetch only `bar_date > MAX(bar_date)` from the cache.

Expected delta drop: ~1-2%.

### 8.3 MEDIUM impact / LOW effort: fix the chart spikes

User reported 4 sharp downward spikes in the chart around specific dates. These are almost certainly single-day missing prices from Yahoo on those dates, which makes `marketValue` briefly zero because the last-known-price carry-forward in `calculateImportedMarketValue` doesn't cover all edge cases.

Look at [calculateImportedMarketValue](../server/services/totalReturnService.js) around line 1136. The `getLastKnownValue` helper should fill from previous dates, but may not if `priceSeries.pricesByDate.has(date)` returns `true` but the value is `null` or `0`. Audit and tighten.

### 8.4 MEDIUM impact / MEDIUM effort: decide on TwelveData

Three paths:

1. **Remove entirely.** Clean up: delete `corporateActionsService.js`, the `/api/history/corporate-actions/refresh` route, the button + Switch in `RawTotalReturnChart`, the `corporate_actions` table (optional — data's harmless). Remove `dotenv` dep unless used elsewhere. Remove `TWELVEDATA_API_KEY` from `CLAUDE.md`.
2. **Leave as-is.** Harmless dead code that future-proofs against upgrading.
3. **Repurpose for historical prices** (Section 8.2). Keep the service, repurpose `refreshSplitsForTickers` into `refreshHistoricalPricesForTickers` calling `/time_series`. Reuse cache pattern.

User's call.

### 8.5 LOW impact / LOW effort: display polish

- Add a "last refreshed" timestamp next to the chart header.
- Format the diagnostic chips with icons (warning triangle for errors, info for estimated).
- Add a download / export button for the diagnostic table.

### 8.6 LOW impact / HIGH effort: revisit adjclose vs close

See Section 5.1. Using `close` (raw) instead of `adjclose` would fix the historical-value under-representation on split tickers, but requires separately tracking splits AND dividends in the `corporate_actions` table (both are currently baked into `adjclose`). Non-trivial rework. Only worth it if you start caring about historical chart accuracy, not just latest-date delta.

### 8.7 Future-proofing: API-path split support

The API-only path (`buildPriceSeries` in `fetchMarketData`, line ~1202) doesn't extract or apply splits at all. It's only reached when there are no export rows in the DB. If a future user loses / never imports their CSV, the API-only path will regress to the original 20%+ error regime.

Fix: port `getChartSplitsByDate` + `applySplitEvents` logic into the API-only path. Same code shape as the imported path. Small, bounded change.

---

## 9. Security notes

- [server/.env](../server/.env) contains `TWELVEDATA_API_KEY`. It's gitignored. It was pasted in plaintext twice during the chat session that produced this work — **both values should be considered compromised** and the key rotated again before this session is archived or shared.
- PowerShell history file (`~/AppData/Roaming/Microsoft/Windows/PowerShell/PSReadLine/ConsoleHost_history.txt`) may also contain leaked key text.
- `.env` should never be opened in the IDE when sharing screen or chat transcripts — opening the file triggers the IDE-opened-file context pipe which puts contents in any active assistant's scratchpad.

---

## 10. Useful one-liner diagnostics

### Reconstructed vs actual holdings

```bash
cd server && node -e "
const Database = require('better-sqlite3');
const db = new Database('../data/portfolio.db', { readonly: true });
const orders = db.prepare(\`
  SELECT ticker, side, fill_quantity, order_filled_quantity
  FROM orders WHERE status='FILLED' AND ticker IS NOT NULL
    AND (fill_quantity IS NOT NULL OR order_filled_quantity IS NOT NULL)
\`).all();
const recon = new Map();
for (const o of orders) {
  const q = Math.abs(Number(o.fill_quantity ?? o.order_filled_quantity ?? 0));
  if (!Number.isFinite(q) || q === 0) continue;
  recon.set(o.ticker, (recon.get(o.ticker) || 0) + (o.side === 'SELL' ? -q : q));
}
const pos = new Map(db.prepare('SELECT ticker, quantity, wallet_current_value FROM positions').all().map(p => [p.ticker, p]));
for (const [t, q] of recon) {
  const p = pos.get(t);
  if (!p) continue;
  const ratio = q / p.quantity;
  if (Math.abs(ratio - 1) > 0.01) console.log(t.padEnd(14), 'recon=' + q.toFixed(4).padStart(12), 't212=' + p.quantity.toFixed(4).padStart(12), 'ratio=' + ratio.toFixed(3) + 'x');
}
"
```

### Full reconstruction run without touching the UI

```bash
cd server && node -e "
require('dotenv').config();
const svc = require('./services/totalReturnService');
(async () => {
  const r = await svc.buildTotalReturnHistory({ skipReconciliation: true });
  console.log('points:', r.points.length);
  console.log('mismatched:', r.diagnostics.mismatchedHoldings.length);
  console.log('stale:', r.diagnostics.staleHoldings.length);
  console.log('fill-fallback:', r.estimatedSymbols.length);
  console.log('delta:', r.diagnostics.deltaPercent + '%');
  console.log('reconstructed:', r.diagnostics.reconstructedLatestValue);
  console.log('t212 summary:', r.diagnostics.currentSummaryValue);
})();
"
```

### Check what TwelveData actually responds with for a given ticker

```bash
cd server && node -e "
require('dotenv').config();
const svc = require('./services/corporateActionsService');
(async () => {
  // skip if no key
  if (!process.env.TWELVEDATA_API_KEY) { console.log('no key'); return; }
  const r = await svc.refreshSplitsForTickers(['LRCX_US_EQ'], { maxAgeDays: 0 });
  console.log(JSON.stringify(r, null, 2));
})();
"
```

### Inspect Yahoo's raw response for a single symbol

```bash
cd server && node -e "
const YF = require('yahoo-finance2').default;
const yf = new YF();
yf.chart('LRCX', {
  period1: '2020-06-16', period2: '2026-04-26', interval: '1d',
  includePrePost: false, events: 'split',
}, { validateResult: false }).then(r => {
  console.log('splits:', JSON.stringify(r.events?.splits));
  console.log('quote count:', r.quotes?.length);
});
"
```

---

## 11. Quick architectural recap for Codex

- **Language:** Node.js backend (CommonJS), React 18 / Vite frontend, SQLite (better-sqlite3) cache.
- **T212 is the source of truth** for orders, positions, transactions, dividends. Data is mirrored into SQLite on sync.
- **Yahoo Finance** (via `yahoo-finance2`) provides market prices + split events. This was the *only* free data source that actually worked for splits during the session.
- **TwelveData** was added as a belt-and-braces corporate-actions feed. Turned out `/splits` is paywalled on the free tier. Infra remains but nothing lands in the cache table on clicks.
- **Manual override** slot exists in the `corporate_actions` table with highest priority. No UI for it yet.
- **Two reconstruction paths** in `totalReturnService.js`:
  - **Imported path** — used when `t212_export_rows` is non-empty. Full CSV history + API orders/transactions/dividends + Yahoo prices + splits. Has `applySplitEvents`. The primary path today.
  - **API-only path** — fallback. No splits. Previously the primary path; now mostly dormant. Still includes the deposit-backfill from exports added earlier.
- **Single-user app.** User ID is hardcoded to 1 in all queries. Don't build for multi-tenant.
- **No unit tests exist** in the repo per `CLAUDE.md` — if you add changes, consider starting with a smoke test that exercises `buildTotalReturnHistory({ skipReconciliation: true })` against a fixture DB.
