# Portfolio Tracker — Handover Notes
**Date:** 2026-04-20  
**Branch:** `Test` (remote: `origin/Test`)

---

## What Was Done

### 1. React Router v6 — URL-based Navigation
**Commits:** `2de381a`

Replaced state-based page switching (`useState('dashboard')`) with proper client-side routing.

| File | Change |
|------|--------|
| `client/src/main.jsx` | Wrapped app in `<BrowserRouter>` |
| `client/src/App.jsx` | Replaced `if/else` render with `<Routes>`/`<Route>`, added `ProtectedRoute` |
| `client/src/components/Layout.jsx` | Removed `currentPage`/`onNavigate` props; uses `useLocation`/`useNavigate` directly |
| `client/src/pages/DashboardPage.jsx` | Removed `onNavigate` prop |
| `client/src/pages/HeatmapPage.jsx` | Removed `onNavigate` prop |

Routes: `/dashboard` (protected), `/heatmap` (protected), `/login` (public), `/*` → redirect to `/dashboard`.

---

### 2. Login Page Never Redirected
**Commit:** `de131b9`

`LoginPage.jsx` called `await login(...)` but never navigated after success — `isAuthenticated` flipped in context but the page just sat there.

**Fix:** Added `useNavigate` and `navigate('/dashboard')` immediately after a successful `login()` call.

---

### 3. Rate Limit Storm on Auth Status
**Commit:** `de131b9`

`GET /api/auth/status` was calling the T212 live API (`/account/summary`) on every auth check to "validate" credentials. After a session loss (crypto key issue), this fired repeatedly on every page load, burning through the rate limit before login could even start — cascading 429s.

**Fix:** Removed the live T212 call from the status restore path. Now just decrypts the stored key (proves the encryption key is still valid) and restores the session directly from the DB.

---

### 4. Vite Upgrade
**Commit:** `e905ffc` — `client` upgraded from Vite v5 → v7 (dependency update only).

---

## Lessons Learnt

**Remove prop-drilling when the hook owns it.** `onNavigate` and `currentPage` were threaded through 3 layers (App → Page → Layout). Moving navigation into Layout via `useNavigate`/`useLocation` removed all of it and was the right design from the start.

**Don't validate credentials on every auth check.** The purpose of a session is to avoid repeated upstream calls. Trusting the DB + decryption success is sufficient to restore a session; live validation belongs only at login time.

**State-based routing silently breaks the URL.** A `useState` page switcher looks like routing but breaks refresh, back/forward, and deep links. If pages are distinct URLs, use a router.

**Unrelated working tree changes need separate commits.** The Vite upgrade was mixed in with the router work — caught and split into its own commit.

---

## Current State

- All three fixes are merged into `origin/Test`
- Working tree is clean
- Server SPA fallback already existed (`server/index.js:38-43`) — no changes needed for production refresh support
