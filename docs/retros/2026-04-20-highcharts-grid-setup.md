# Highcharts Grid Setup — Phase 0 Retro
**Date:** 2026-04-20
**Branch:** `Highcharts-Refactor`

---

## What Was Done

Infrastructure-only work to prepare for replacing the two MUI-based tables (`PositionsTable.jsx`, `DividendHistoryTable.jsx`) with Highcharts Grid. Neither table was touched.

### 1. Install `@highcharts/grid-lite-react`
**Commit:** `4942552`

```bash
cd client && npm install @highcharts/grid-lite-react
```

Pulls in `@highcharts/grid-lite@2.3.1` as a transitive dep. Existing `highcharts`, `@highcharts/react`, and `recharts` unchanged.

### 2. Dark theme CSS + main.jsx import
**Commit:** `59deaf9`

New file: `client/src/styles/highchartsGrid.css` — a scoped `.hcg-dark` class that sets the Grid Lite theming CSS variables to match the MUI dark theme. Imported in `main.jsx` after the chart theme.

### 3. Grid wrapper component
**Commit:** `cc0ed73`

New file: `client/src/components/HighchartsGrid.jsx`. Minimal wrapper that spreads caller `options`, then merges `rendering.theme = 'hcg-theme-default hcg-dark'` so every instance picks up the Grid default styles plus our dark overrides without the caller having to opt in.

### 4. Append cell formatters to utils
**Commit:** `6fee3bc`

Appended three zero-arg `function` declarations to `client/src/utils/highchartsUtils.js`:
- `plCellFormatter` — green/red HTML span for P/L values
- `currencyCellFormatter` — GBP via `Intl.NumberFormat`
- `percentCellFormatter` — signed percent string

Existing exports (`formatCurrency`, `formatPercent`, `currencyYAxisConfig`, `responsiveRules`) left untouched.

### 5. Smoke test (no commit)
Added a temporary `<HighchartsGrid>` with a 3-row test dataset above `<Routes>` in `App.jsx`. Ran `npm run dev:client`, visually confirmed dark theme and no console errors on both `/login` and `/dashboard` (with existing MUI tables still rendering correctly alongside the test grid), then reverted `App.jsx` via `git checkout --`.

---

## Version Installed

| Package | Version |
|---|---|
| `@highcharts/grid-lite-react` | `1.0.0` |
| `@highcharts/grid-lite` (transitive) | `2.3.1` |

Other highcharts deps (`highcharts@12.6.0`, `@highcharts/react@4.2.1`) and `recharts@2.15.4` unchanged.

---

## Key Finding

**`@highcharts/grid-lite-react` is the right React package, not `@highcharts/grid-lite` directly.** The React package wraps the vanilla `grid-lite` with a `<Grid options={...} />` JSX component, manages the grid lifecycle (setup/teardown), and loads its own CSS internally. So we never call `new Grid(...)`, never need `useRef`/`useEffect`, never import grid CSS manually — the component does all of that.

Two call-convention rules that aren't obvious from a glance at the README:
- **Options must live in `useState`** (or be otherwise stable across renders). Plain object literals re-create on every render, which causes the grid to tear down and rebuild.
- **Cell formatters use `this.value`** — they're invoked as cell-scoped callbacks, not passed a value argument. Must be regular `function` declarations; arrow functions don't bind `this`.

---

## CSS Variable Names Used

All names below are official Grid Lite theming vars (not renamed). Scoped to a `.hcg-dark` class so the theme is opt-in per instance, not applied to `:root`:

| Var | Value | Why |
|---|---|---|
| `--hcg-background` | `#111827` | MUI `background.paper` |
| `--hcg-color` | `#e0e0e0` | MUI `text.primary` |
| `--hcg-row-even-background` | `#0a0e17` | MUI `background.default` for alternating rows |
| `--hcg-header-background` | `#1e2433` | Matches chart tooltip bg — keeps grid header visually adjacent to our chart styling |
| `--hcg-header-color` | `#e0e0e0` | MUI `text.primary` |
| `--hcg-row-hover-background` | `rgba(255,255,255,0.08)` | Solid-ish hover colour |
| `--hcg-hover-opacity` | `50%` | Grid scales the hover colour by this |
| `--hcg-border-color` / `--hcg-row-border-color` / `--hcg-column-border-color` | `rgba(255,255,255,0.06)` | MUI `MuiCard` border |
| `--hcg-border-width` | `1px` | |
| `--hcg-border-style` | `solid` | |
| `--hcg-padding` | `8px` | Vertical cell padding |
| `--hcg-horizontal-padding` | `12px` | Horizontal cell padding |
| `--hcg-font-family` | `"Inter", "Roboto", "Helvetica", "Arial", sans-serif` | Same MUI font stack as chart theme |
| `--hcg-font-size` | `0.8rem` | |

---

## Dark Theme Approach

- **Scoped class, not `:root`.** The dark theme applies only where Grid's `rendering.theme` is set, not globally. Keeps Grid adoption opt-in per instance.
- **`rendering.theme: 'hcg-theme-default hcg-dark'`** — the default theme carries borders, base spacing, and light/dark system defaults. Chaining the default with our dark overrides means we *extend* rather than *replace*, so we only redeclare the handful of colours/paddings we actually care about.
- **Grid owns the class attachment** via the `rendering.theme` option, so the wrapper doesn't add a `<div>` around the grid. Keeps the DOM flat and avoids an unnecessary layout box.

---

## Deviations from the Original Task Brief

All caught during plan review before any code was written:

1. **`<div className="hcg-dark">` wrapper → `rendering.theme` option.** The brief wrapped `<Grid>` in a div to apply the class. Cleaner to let Grid attach its own class via the built-in option — one fewer DOM node, and the wrapper stays a pure passthrough.
2. **`data: { columns: {...} }` → `dataTable: { columns: {...} }`.** Per the actual Grid docs, the config key is `dataTable`, not `data`. The smoke test would not have rendered anything with the brief's shape.
3. **Hover variable semantics.** The brief used `--hcg-row-hover-background: rgba(…,0.04)` with `--hcg-hover-opacity: 100%`. Per the v2.x docs the hover colour is meant to be a solid(ish) base and `--hcg-hover-opacity` is the scaler. Switched to `rgba(…,0.08)` + `50%` so the effective strength is comparable but the mechanism is used as designed.
4. **Padding.** Grid defaults to zero cell padding, which produced cramped rows in early spikes. Added `--hcg-padding: 8px` and `--hcg-horizontal-padding: 12px`.
5. **Cell formatter signatures.** The brief's formatters took `(value)` as an argument. Grid invokes formatters as cell-scoped callbacks, so they must be `function` declarations reading `this.value`. An arrow function would silently read `undefined`.
6. **`hcg-theme-default` chained before `hcg-dark`.** Not in the brief. Without the default class, Grid loses its base styles entirely and we'd have to redeclare them.

Theme `rendering` is merged *after* spreading caller options (`{ ...options, rendering: { ...options?.rendering, theme: '...' } }`) so a future caller can still add their own `rendering` keys (e.g. `rowHeight`) without clobbering the theme.

---

## Formatter Call Convention

The three new `*CellFormatter` functions are **not** redundant with the existing `formatPercent` / `formatCurrency`:

| | existing (`formatCurrency`, `formatPercent`) | new (`*CellFormatter`) |
|---|---|---|
| Signature | `(value) => string` | `function() { /* reads this.value */ }` |
| Caller | Chart tooltips, JSX, anywhere direct | Grid column `cellFormatter` only |
| Return | Plain string | String (may include HTML, e.g. `plCellFormatter` colour span) |

Keeping both means grid cells get HTML support (for conditional colours in `plCellFormatter`) while chart/UI code keeps a simpler value-in, string-out shape.

---

## Issues Encountered

None. Vite picked up the new CSS cleanly (observed as an "re-optimizing dependencies" message on first boot after `npm install`, which is normal). The only surprise was port `5173` being taken by an earlier dev session; Vite auto-fell back to `5174`.

---

## Current State

- 4 implementation commits + this retro = 5 new commits on `Highcharts-Refactor` on top of the Phase 0 chart work.
- Working tree clean.
- Both MUI tables untouched; recharts still installed.
- No new lint/build configuration needed.

---

## Next Step

Refactor `PositionsTable.jsx` **first**, then `DividendHistoryTable.jsx`.

Why `PositionsTable` first despite being more complex:
- 125 lines with client-side sorting, computed P/L / P/L% / weight / yield fields, and conditional green/red cell colouring — the new `plCellFormatter` was designed for exactly this.
- Exercises more of the Grid API (sorting, formatters) than `DividendHistoryTable`, so if anything is missing from the wrapper or utils it surfaces early.
- `DividendHistoryTable` (57 lines, stateless, sticky header, 6 columns) is a small mop-up after and gets to reuse whatever patterns the first refactor establishes.

Each refactor should:
1. Consume `HighchartsGrid` and the relevant `*CellFormatter`s.
2. Keep `useState` for grid options per the Grid Lite React rule.
3. Remove MUI `<Table>` imports from that file only.

Only after both tables are ported should we consider removing `recharts` (it's still referenced by existing chart components that haven't been migrated yet — that's a separate Phase 1 body of work).
