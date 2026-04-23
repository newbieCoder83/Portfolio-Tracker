# Dividends By Company Highcharts Refactor Retro
**Date:** 2026-04-23
**Branch:** `Highcharts-Refactor`

---

## What Was Done

### 1. Replace the mask-based chart scrolling layout with an axis-scrollbar layout

Changed files:
- `client/src/components/DividendsByCompany.jsx`

The chart still uses Highcharts and still keeps the same component input, card shell, title, empty state, descending company sort, truncated company labels, GBP formatting, and tooltip use of the full company name.

The earlier Highcharts pass used `chart.scrollablePlotArea.minHeight` to scroll the plot region. That created the visual problems seen in the dashboard:
- the right scrollbar visually ran through the bottom axis/footer area
- the top-right corner looked clipped
- the bottom area under the axis showed transparency from the fixed mask setup

This follow-up replaced that approach with a Highcharts Stock bundle axis scrollbar while still rendering a normal `bar` chart through the regular `chart` constructor.

The category axis now uses an axis scrollbar on the right-hand side of the chart. The chart shows a fixed number of visible company rows based on the real rendered chart height, and the scrollbar is used to move through the rest of the companies.

This removed the need for the old fixed mask/footer workaround and gave the chart a normal bottom value-axis area instead of a fake band placed over the chart.

### 2. Keep wrapper-driven resizing and tie it to the visible row window

Changed files:
- `client/src/components/DividendsByCompany.jsx`

The existing `ResizeObserver` pattern was kept, but the resize sync now does two jobs:
- resize the chart to the wrapper
- recalculate how many company rows can fit in the visible plot height

After resize, the component updates the category axis extremes so the chart keeps a clean fixed viewport and only enables the scrollbar when the dataset is taller than the available plot space.

### 3. Add mouse-wheel scrolling for the company window

Changed files:
- `client/src/components/DividendsByCompany.jsx`

The axis scrollbar looked correct visually, but it still required dragging the thumb directly. Mouse-wheel input was still scrolling the page because the Highcharts axis scrollbar does not bind wheel events.

This follow-up added a small component-level wheel handler on the chart wrapper. When the pointer is over the interactive chart area and the category window can still move, wheel input now shifts the visible company window by rows using `xAxis.setExtremes(...)`.

Page scrolling is only prevented when the chart actually moves. If the chart is already at the top or bottom, or if there are not enough companies to need scrolling, normal page scrolling is preserved.

### 4. Update the feature retro

Changed files:
- `docs/retros/2026-04-23-dividends-by-company-highcharts-refactor.md`

Updated the handover notes so they describe the final scrollbar-based layout instead of the earlier `scrollablePlotArea` workaround.

---

## Key Findings

- `chart.scrollablePlotArea` was the wrong fit for this layout goal because it relies on a fixed mask around a full-height scrolling container.
- For this chart, the cleaner structure is to keep a regular chart layout and scroll the category axis window instead.
- Loading the Stock bundle only for this component was enough to use axis scrollbars without migrating the rest of the dashboard charts.
- The existing resize pattern was still useful. The important missing piece was recalculating the visible row window from the actual rendered plot height.
- For this chart, mouse-wheel scrolling needed a custom handler because Highcharts' axis scrollbar interaction covers dragging, clicking, and touch, but not wheel input.

---

## Implementation Notes

- The component now imports `StockChart` and the Stock Highcharts instance from `@highcharts/react/Stock`.
- The existing shared Highcharts theme is applied to the Stock instance locally in this component module so the chart keeps the same visual language as the rest of the dashboard.
- The chart still renders as `chart.type = 'bar'`.
- The category axis now uses:
  - `scrollbar.enabled`
  - `scrollbar.opposite = true`
  - `scrollbar.buttonsEnabled = false`
- The visible row window is based on `ROW_HEIGHT = 28` and the live `chart.plotHeight`.
- The bottom value axis is now part of the normal chart layout again, with spacing and axis offset used to keep it separate from the plot area.
- The old `scrollablePlotArea` settings and mask-driven footer workaround were removed.
- The chart now also listens for wheel input on the wrapper and translates that input into category-axis window shifts.
- Wheel input only prevents page scrolling when the chart window actually moves, so the page still scrolls normally at the ends of the chart range.

---

## Lessons Learnt

- A layout that looks like “scroll the data area but keep the axes clean” is not always best served by `scrollablePlotArea`, even if it sounds close on paper.
- When a chart’s visible window depends on the rendered size, syncing only the outer width and height is not enough. The chart also needs a second pass that updates the visible data range.
- For UI bugs like clipping and transparency, the smallest safe fix is often changing the chart structure rather than adding another visual patch on top.

---

## Verification

- `npm.cmd run build` from the repo root passed on 2026-04-23 after the layout cleanup and wheel-scrolling follow-up.
- Browser-based manual verification was not completed in this pass, so the visual result is verified by build success and by the structural removal of the old mask-based scrolling approach.

---

## Current State

- `DividendsByCompany.jsx` still uses Highcharts and still renders a horizontal company dividend ranking.
- Company names remain truncated on the axis and full in the tooltip.
- The bottom value axis still displays GBP values.
- The chart now uses a right-side axis scrollbar instead of `scrollablePlotArea`.
- The bottom axis/footer area is now part of the normal chart layout instead of a fixed overlay band.
- The chart still fills the dashboard card and still resizes to the actual wrapper dimensions.
- Mouse-wheel input over the chart can now move the visible company window without requiring direct scrollbar dragging.

---

## Next Step

The most useful follow-up is a short browser QA pass on the dashboard to confirm the footer spacing, right-side scrollbar feel, and resize behavior against the real page layout.
