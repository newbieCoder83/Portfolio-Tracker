# Sync Button Lock Retro
**Date:** 2026-04-23
**Branch:** `Highcharts-Refactor`

---

## What Was Done

### 1. Disable the Sync button while any sync is running
**Commit:** See the git history for the final feature commit on `Highcharts-Refactor`

Changed files:
- `client/src/components/Layout.jsx`
- `client/src/context/AuthContext.jsx`
- `server/routes/auth.js`
- `server/routes/sync.js`
- `server/services/syncStatus.js`

Added a shared sync-status flow so the `Sync Now` button is disabled not just during its own click handler, but also while the background full sync after login is still running.

The visible behavior now is:
- the button cannot be pressed while a sync is active
- the button text changes to `Synching`
- the button gets a darker disabled look while unavailable

### 2. Add a server-side sync lock
**Commit:** Same feature commit as above

Added a small in-memory sync status service for this single-user app.

That service now:
- tracks whether a sync is active
- records whether the active sync is `full` or `incremental`
- prevents a second sync from starting while one is already running

### 3. Expose sync status to the frontend
**Commit:** Same feature commit as above

Added a sync status route and wired the auth context to read it.

This lets the frontend know about:
- the background full sync triggered after login
- the incremental sync triggered by clicking `Sync Now`

The auth context now polls while a sync is active so the button re-enables automatically when the sync finishes.

---

## Key Findings

- The old button state in `Layout.jsx` only knew about its own local click spinner. It had no way to see the background full sync launched by the login route.
- The real problem was not just styling. The backend also allowed overlapping sync jobs, which is what caused the confusing log interleaving and extra rate-limit pressure.
- A shared server-side sync lock is a small fix that solves both problems at once: safer backend behavior and a truthful frontend button state.
- Because this app is single-user and local-first, an in-memory sync lock is a reasonable first implementation and keeps the change small.

---

## Issues Encountered

- There was already an unrelated untracked docs file in the working tree: `docs/Notes to Human.md`. It was left untouched.
- The existing Vite large-chunk warning still appears during production builds. This change did not affect that warning.

---

## Verification

- `npm.cmd run build` from the repo root: passed
- `node --check server/routes/auth.js`: passed
- `node --check server/routes/sync.js`: passed
- `node --check server/services/syncStatus.js`: passed

---

## Current State

- The `Sync Now` button is now locked during both full and incremental syncs.
- A manual incremental sync will now be refused by the server if another sync is already active.
- Login-triggered full sync still happens, but the UI now reflects that state and prevents a second sync from being triggered from the dashboard.
- No database schema changes were needed.

---

## Next Step

The next sensible follow-up would be deciding whether login should always start a full sync, or only do that on first login / account change / environment change. This change does not alter that policy; it only makes the current behavior safer and clearer.
