# Docs Freshness Reconciliation Retro
**Date:** 2026-04-29
**Branch:** `Highcharts-Refactor`

---

## What Was Done

### 1. Recheck external API and package documentation
**Commit:** Not committed yet

Changed files:
- `docs/t212-api-reference.md`
- `CLAUDE.md`
- `README.md`
- `docs/raw-total-return-handover.md`
- `docs/retros/2026-04-29-docs-freshness-reconciliation.md`

Rechecked the repo guidance against current public sources:
- Trading 212 official docs and downloadable OpenAPI
- Highcharts API/docs and npm package metadata
- `yahoo-finance2` JSR/npm metadata
- Python `yfinance` PyPI/docs
- Twelve Data docs and pricing pages

### 2. Update the Trading 212 reference

Updated the local API reference verification date to 2026-04-29 and corrected the order-placement request examples. The official OpenAPI uses `timeValidity` in `limit`, `stop`, and `stop_limit` request bodies, while returned order objects still expose `timeInForce`.

Added the missing tax fields from the OpenAPI (`currency`, `quantity`) and expanded the export-report section with the request and response shapes used by `/api/v0/equity/history/exports`.

Added a short warning that official Pies endpoints still exist but are deprecated and unused by this project.

### 3. Update current repo guidance

Updated `CLAUDE.md` and `README.md` so they no longer describe the frontend as Recharts-first. The current guidance now says Highcharts and Highcharts Grid Lite are used for charts/tables, while Recharts remains for the heatmap treemap.

Added a compact external-doc freshness note covering:
- `yahoo-finance2@3.14.0`
- Python `yfinance@1.3.0`
- `highcharts@12.6.0`
- `@highcharts/react@4.2.1`
- `@highcharts/grid-lite-react@1.0.0`
- `@highcharts/grid-lite@2.3.1`

### 4. Mark stale handover notes as historical

Added a 2026-04-29 freshness note to `docs/raw-total-return-handover.md` explaining that later drift/cache work superseded parts of that handover.

The main correction is that current total-return split handling should use Yahoo chart splits plus manual DB split overrides. Stale TwelveData split rows should not override Yahoo. The handover now points future readers to the later drift and historical-price-cache docs.

---

## Key Findings

- Trading 212's OpenAPI still uses `/api/v0/equity/account/summary` as the current account-summary endpoint.
- Trading 212's order request and response names differ: `timeValidity` for requests, `timeInForce` for responses.
- Trading 212's official Pies endpoints are still listed but deprecated.
- Highcharts and the installed Highcharts React/Grid packages were already current.
- Yahoo Finance access remains unofficial through both `yahoo-finance2` and Python `yfinance`, so docs should describe it as best-effort data.
- Twelve Data `/splits` should be treated as paid Grow+ data, while `/time_series` is lower-cost but not reliable for every delisted or non-US symbol.

---

## Current State

- Docs now reflect the external-source check performed on 2026-04-29.
- No runtime code, dependency, database, auth, secret, or deployment files were changed.
- No build was required because this was a docs-only change.

---

## Next Step

If these docs are edited again, re-fetch the Trading 212 OpenAPI first and check request/response field names directly before copying examples into the local reference.
