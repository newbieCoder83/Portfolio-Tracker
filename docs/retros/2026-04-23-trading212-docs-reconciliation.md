# Trading 212 Docs Reconciliation Retro
**Date:** 2026-04-23
**Branch:** `Highcharts-Refactor`

---

## What Was Done

### 1. Reconcile the local Trading 212 reference with the latest official docs and OpenAPI spec
**Commit:** Not committed yet

Changed files:
- `docs/t212-api-reference.md`

Reviewed the current Trading 212 docs and downloadable OpenAPI description, then updated the repo's local API reference to match the latest standard used by the project.

The doc changes were kept small and focused:
- updated the verification note to show the reference was checked against both the docs site and the OpenAPI download on 2026-04-23
- clarified the difference between the official API root (`.../api/v0`) and the host-only base used by this project code
- added a note that `/api/v0/equity/account/summary` is the current project standard, even though some Trading 212 quickstart/search snippets still show `/api/v0/equity/account/cash`
- updated the dividend `paidOn` example and description to match the current OpenAPI `date-time` format
- added an implementation note warning that UI code should normalise dividend dates at the display layer if it only wants `YYYY-MM-DD`

---

## Key Findings

- The project's actual Trading 212 integration was already aligned with the current official endpoint set. This was mainly a documentation reconciliation task, not a backend fix.
- The most important current docs mismatch is not in the project code. It is in Trading 212's own public materials, where some quickstart/search-result pages still show `account/cash` while the current Accounts section and OpenAPI spec use `account/summary`.
- The current OpenAPI spec documents dividend `paidOn` as a `date-time` string. That does not break the current sync logic, but it is worth documenting because UI code can look cleaner if it normalises the value before display.
- Writing both the official API root and the host-only project base in the local reference makes the docs easier to follow for future debugging, because both are technically correct in different contexts.

---

## Issues Encountered

- The original markdown file had some existing character-encoding noise in console output, so the cleanest safe fix was to rewrite the reference file in plain ASCII while preserving the existing content structure.
- No code or schema changes were needed after the documentation review.

---

## Current State

- Local Trading 212 reference is updated to the latest checked standard as of 2026-04-23.
- Files touched for this task:
  `docs/t212-api-reference.md`
  `docs/retros/2026-04-23-trading212-docs-reconciliation.md`
- No automated tests or builds were run because this was a docs-only change.
- No runtime behavior was changed.

---

## Next Step

Optional follow-up only: if you want the UI to be fully future-proof against a timestamp-style dividend date, normalise `paidOn` to a display-only date string in the frontend instead of assuming the API will always send `YYYY-MM-DD`.
