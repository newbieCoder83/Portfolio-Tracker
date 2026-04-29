# Portfolio Tracker — Developer Guide

## Project Context
Personal full-stack portfolio tracker for Trading 212 (T212) accounts. Built by a first-time developer using Claude AI. Single-user app for personal use only. Explanations should be plain English — avoid jargon where possible, and always explain *why* a change is being made, not just what to change.

## Tech Stack
- **Backend:** Node.js + Express (`server/`), better-sqlite3, axios
- **Frontend:** React 18 + Vite (`client/`), MUI 5, Highcharts, Highcharts Grid Lite, Recharts for the heatmap treemap
- **Database:** SQLite at `./data/portfolio.db`
- **Encryption:** AES-256-GCM, key at `./data/.enc_key`

## Architecture
```
Browser → Vite dev server (:5173) → proxy /api → Express (:3001) → SQLite
Production: Express (:3000) serves client/dist + handles /api routes
```

## Key Design Decisions
- **Backend proxy:** All T212 API calls go through Express. The frontend never touches T212 directly.
- **SQLite as cache:** Data synced from T212 is stored locally. Dashboard reads from DB (fast, offline-capable). "Sync Now" fetches fresh data from T212.
- **Rate limiter:** Token-bucket per endpoint in `server/services/rateLimiter.js`. Categories: summary (1/5s), positions (1/1s), dividends (6/60s), orders (6/60s), instruments (1/50s).
- **Single user:** App supports one user (id=1). Credentials encrypted at rest.
- **Heatmap data source:** Yahoo Finance (via yahoo-finance2) provides live prices, sector, and industry data. T212 ticker format is normalised to Yahoo format via `normaliseToYahoo()` in `server/routes/heatmap.js`. Always keep the original T212 ticker in responses — only use the converted ticker when calling Yahoo.

## API Reference
All T212 field names and schemas come from `docs/t212-api-reference.md`. This is the single source of truth — never guess field names.

## External Docs Freshness
Last checked against public sources on 2026-04-29.

- Trading 212 docs/OpenAPI: `docs/t212-api-reference.md` is the project source of truth. Official Pies endpoints still exist but are deprecated and unused by this app.
- Yahoo Finance access: this app uses the JavaScript `yahoo-finance2` package, not Python `yfinance`. Latest checked package versions were `yahoo-finance2@3.14.0` and Python `yfinance@1.3.0`.
- Yahoo Finance warning: `yahoo-finance2` and `yfinance` are unofficial Yahoo Finance access libraries. Treat Yahoo data as best-effort market data that can change, be incomplete, or fail without notice.
- Highcharts packages: latest checked versions were `highcharts@12.6.0`, `@highcharts/react@4.2.1`, `@highcharts/grid-lite-react@1.0.0`, and `@highcharts/grid-lite@2.3.1`.
- Twelve Data: `/splits` is a paid Grow+ endpoint and costs 20 credits per symbol. `/time_series` is 1 credit per symbol, but Basic/free coverage may not include old delisted or non-US symbols; manual CSV import remains the reliable fallback for those.

## Commands
```bash
npm run dev      # Start server + Vite concurrently (use this for development)
npm run build    # Build client for production (outputs to client/dist)
npm start        # Start production server on :3000
```

## Environment variables
- `PORT` — dev server port (defaults to 3001)
- `TWELVEDATA_API_KEY` — optional. Free key from https://twelvedata.com/register. Used by the **Refresh historical prices** button on `/total-return` to try backfilling daily prices when Yahoo has no data for old or delisted holdings. Some delisted symbols are not available on TwelveData Basic, so manual CSV import through `server/scripts/importHistoricalPrices.js` is the reliable fallback. Set inline (`TWELVEDATA_API_KEY=xxx npm run dev`) or export from your shell.

## Project Structure
```
server/
  index.js                # Express entry point (~47 lines)
  db/connection.js        # SQLite singleton (WAL mode)
  db/schema.js            # CREATE TABLE statements
  middleware/session.js   # express-session config
  middleware/auth.js      # requireAuth middleware
  services/crypto.js      # AES-256-GCM encrypt/decrypt
  services/rateLimiter.js # Token-bucket rate limiter
  services/cache.js       # 30s in-memory cache
  services/t212Client.js  # T212 API client with retry
  services/syncService.js # Full + incremental sync logic
  routes/auth.js          # login / logout / status
  routes/account.js       # GET /api/account/summary
  routes/portfolio.js     # GET /api/portfolio/positions
  routes/history.js       # GET /api/history/dividends, /orders
  routes/sync.js          # POST /api/sync, GET /api/sync/snapshots
  routes/heatmap.js       # GET /api/heatmap — Yahoo Finance enrichment

client/src/
  main.jsx, App.jsx       # Entry + routing
  theme.js                # Dark MUI theme
  api/client.js           # Axios instance (baseURL: '')
  context/AuthContext.jsx # Auth state
  pages/LoginPage.jsx     # Login form
  pages/DashboardPage.jsx # Main dashboard (fetches 5 endpoints in parallel)
  pages/HeatmapPage.jsx   # Treemap heatmap with sector/industry/stock depth
  components/             # Highcharts charts/tables, Recharts heatmap, MUI shells
```

## Sync Flow
1. Login → validate creds against T212 → encrypt → store → fullSync
2. **fullSync:** summary + positions + all dividends + all orders + instruments
3. **incrementalSync:** refresh summary/positions, only new dividends/orders, instruments if >24h stale
4. Each sync creates/updates a daily snapshot for portfolio value charts

## Heatmap — Implementation Notes
The heatmap (`HeatmapPage.jsx`) uses Recharts `<Treemap>` with a custom SVG renderer (`CustomContent`). Key points:
- **3 depth levels:** depth 1 = sector, depth 2 = industry, depth 3 = stock tile
- **Overlay label system:** Sector and industry labels are NOT rendered inside Recharts SVG (they get clipped/overlapped). Instead they are collected during render via `onLabelCollect` callback and painted on a separate `<svg>` overlay positioned absolutely on top. This was the solution to the overlapping text problem.
- **Colour scale:** Interpolates between red (#C0392B) at -5%, neutral (#1A1A2E) at 0%, green (#00A850) at +5%. Clamped at ±5%.
- **Tooltip:** Two separate floating tooltips — one for stock tiles, one for sector blocks. Rendered outside SVG using `position: fixed` so they are never clipped.
- **Stale fallback:** If Yahoo Finance is unavailable, `lastGoodResult` is served with `stale: true`, triggering a warning banner.
- **Status:** ~95% complete. Text overlap issue largely resolved via overlay system. Not pixel-perfect but functional for personal use.

## Known Bugs
### 1. Duplicate Route Mounting (server/index.js)
```js
// These two lines both mount sync.js:
app.use('/api/sync', requireAuth, require('./routes/sync'));
app.use('/api',      requireAuth, require('./routes/sync')); // ← REMOVE THIS LINE
```
The second line is dead code — the frontend calls `GET /api/sync/snapshots`, not `GET /api/snapshots`. The second mount accidentally exposes `POST /api/` as an unintended sync trigger.
**Fix:** Remove the second line only. Do not change `sync.js`.

## Adding a New Chart
1. Create `client/src/components/MyChart.jsx` using Highcharts unless the chart is specifically a heatmap treemap that matches the existing Recharts heatmap
2. Import in `DashboardPage.jsx`, add to the `Promise.all` fetch block if new data needed
3. Add to the MUI Grid layout in `DashboardPage.jsx`

## What Was Last Worked On
- **Heatmap UI** — overlapping text on sector/industry labels was the main problem. Solved by moving labels out of the Recharts SVG into a separate absolutely-positioned overlay SVG. Hover tooltips for both stock tiles and sector blocks are working. Status: functional, ~95% complete.

## Unit Tests
Not yet implemented. When adding tests, install in `server/`:
```bash
npm install --save-dev jest supertest
```
Priority areas to test first: `requireAuth` middleware, `POST /api/sync` with no user in DB, snapshot query, `decrypt()` in `services/crypto.js`.
