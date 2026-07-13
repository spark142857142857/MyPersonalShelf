# Dashboard Pins Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox syntax. Do not commit unless the user asks.

**Goal:** Add dashboard shortcut pins for content types and collections while keeping item `isFavorite` unchanged (Approach B).

**Architecture:** Store `pinnedTypes` / `pinnedCollections` on `AppSettings`. Normalize in `src/lib/appSettings.ts`. Dashboard shows a shortcut row; click runs existing library filters. Pin toggles live on library type chips and collection cards.

**Tech Stack:** React + TypeScript, existing Vitest, localStorage / native JSON `appSettings`.

**Spec:** `docs/superpowers/specs/2026-07-13-dashboard-pins-design.md`

## Files

- Create: `src/lib/appSettings.ts`, `src/lib/appSettings.test.ts`
- Modify: `src/types.ts`, `src/App.tsx`, `src/lib/i18n.ts`, `src/styles.css`

---

### Task 1: Settings model + normalize

- [x] Add fields to `AppSettings`
- [x] Implement `normalizeAppSettings` with tests
- [x] Wire defaults / load path in `App.tsx`

### Task 2: Pin toggles + rename sync

- [x] `togglePinnedType` / `togglePinnedCollection`
- [x] Update `pinnedCollections` on collection rename
- [x] UI controls on library type chips + collection cards

### Task 3: Dashboard shortcut row

- [x] Render pinned type/collection cards
- [x] Click → library filter (`setActiveType` for types, `filterByCollection` for collections)
- [x] Unpin control on cards
- [x] i18n + CSS

### Task 4: Verify

- [x] `npm.cmd test -- --run`
- [x] `npm.cmd run build`
