# Portfolio Tracker — Developer Guide

## Tech Stack
- **Backend:** Node.js + Express (server/), better-sqlite3, axios
- **Frontend:** React 18 + Vite (client/), MUI 5, Recharts
- **Database:** SQLite at `./data/portfolio.db`
- **Encryption:** AES-256-GCM, key at `./data/.enc_key`

## Architecture
Browser → Vite dev server (:5173) → proxy /api → Express (:3001) → SQLite
In production: Express (:3000) serves client/dist + handles /api routes

## Key Design Decisions
- **Backend proxy:** All T212 API calls go through Express. The frontend never touches the T212 API directly.
- **SQLite as cache:** Data synced from T212 is stored in SQLite. Dashboard reads from DB (fast, offline-capable). "Sync Now" fetches new data from T212.
- **Rate limiter:** Token-bucket per endpoint category in `server/services/rateLimiter.js`. Categories: summary (1/5s), positions (1/1s), dividends (6/60s), orders (6/60s), instruments (1/50s).
- **Single user:** The app supports one user (id=1 in users table). Credentials are encrypted at rest.

## API Reference
All field names and schemas come from `docs/t212-api-reference.md`. This is the single source of truth — never use guessed field names.

## Commands
```bash
npm run dev          # Start server + Vite concurrently
npm run build        # Build client for production
npm start            # Start production server on :3000
```

## Project Structure
```
server/
  index.js              # Express entry point
  db/connection.js      # SQLite singleton (WAL mode)
  db/schema.js          # CREATE TABLE statements
  middleware/session.js  # express-session config
  middleware/auth.js     # requireAuth middleware
  services/crypto.js    # AES-256-GCM encrypt/decrypt
  services/rateLimiter.js # Token-bucket rate limiter
  services/cache.js     # 30s in-memory cache
  services/t212Client.js  # T212 API client with retry
  services/syncService.js # Full + incremental sync
  routes/auth.js        # login/logout/status
  routes/account.js     # GET /api/account/summary
  routes/portfolio.js   # GET /api/portfolio/positions
  routes/history.js     # GET /api/history/dividends, /orders
  routes/sync.js        # POST /api/sync, GET /api/snapshots

client/src/
  main.jsx, App.jsx     # Entry + routing
  theme.js              # Dark MUI theme
  api/client.js         # Axios instance
  context/AuthContext.jsx # Auth state
  pages/LoginPage.jsx   # Login form
  pages/DashboardPage.jsx # Main dashboard
  components/           # 9 chart/table components
```

## Sync Flow
1. Login → validate creds against T212 → encrypt → store → fullSync
2. fullSync: summary + positions + all dividends + all orders + instruments
3. incrementalSync: refresh summary/positions, only new dividends/orders, instruments if >24h stale
4. Each sync creates/updates a daily snapshot for portfolio value charts

## Adding a New Chart
1. Create `client/src/components/MyChart.jsx` using Recharts
2. Import in `DashboardPage.jsx`, pass relevant data props
3. Add to the Grid layout
