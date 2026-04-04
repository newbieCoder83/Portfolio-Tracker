# Portfolio Tracker

A full-stack portfolio tracking dashboard that connects to the Trading 212 API. Runs locally, stores all data in SQLite, encrypts your credentials at rest with AES-256-GCM, and serves a polished dark-themed React dashboard.

## Features

- **Real-time portfolio view** — positions, P/L, allocation, and summary cards
- **Benchmark comparison** — track your portfolio against VUSA (12%/yr) and VHYL (8%/yr) simulations
- **Dividend analytics** — monthly breakdown with drill-down, by-company chart, yield per position, full history table
- **Drawdown tracking** — visualise peak-to-trough drawdowns over time
- **Portfolio value history** — daily snapshots charted over time
- **Incremental sync** — only fetches new data on subsequent syncs
- **Encrypted credentials** — API keys stored with AES-256-GCM, never in plaintext
- **Auto-login** — restores session from saved encrypted credentials on restart

## Prerequisites

- **Node.js 18+** (with npm)
- A **Trading 212** account with API access enabled
  - Go to Settings > API (Beta) in the T212 app to generate your API Key and API Secret

## Quick Start

```bash
# Clone and install
git clone https://github.com/newbiecoder83/portfolio-tracker.git
cd portfolio-tracker
npm install

# Development (server on :3001, Vite on :5173)
npm run dev

# Production build
npm run build
npm start
# → http://localhost:3000
```

## Usage

1. Open the app in your browser
2. Enter your T212 API Key, API Secret, and select environment (Live/Demo)
3. Click "Connect & Sync" — credentials are validated, encrypted, and a full sync begins
4. Dashboard loads with all your data from SQLite
5. Use "Sync Now" to fetch the latest data incrementally

## Tech Stack

- **Backend:** Node.js, Express, better-sqlite3, axios
- **Frontend:** React 18, Material UI 5, Recharts
- **Build:** Vite
- **Database:** SQLite (stored in `./data/portfolio.db`, gitignored)
- **Encryption:** AES-256-GCM via Node.js crypto

## Data Storage

All data is stored locally in `./data/portfolio.db`. The encryption key is stored in `./data/.enc_key`. Both are gitignored. If you delete the `data/` directory, you'll need to log in again.

## API Reference

See [docs/t212-api-reference.md](docs/t212-api-reference.md) for the complete Trading 212 API documentation used by this project.
