# Dashboard pins (items + types + collections) — Design

Date: 2026-07-13  
Status: draft for review  
Approach: **B** — keep item favorites as-is; add pinned types/collections in app settings

## Goal

Let the dashboard act as a **personal shortcut shelf**: not only pinned items, but also pinned **content types** and **collections**. Clicking a type/collection pin jumps to the library with the matching filter.

## Non-goals (this round)

- Tag pins
- Preview lists inside type/collection cards (counts optional, no item thumbnails required)
- Replacing `isFavorite` with a unified pin store (Approach A)
- Changing export/import format beyond extending `appSettings`

## Current behavior

- Items use `ContentItem.isFavorite`.
- Dashboard favorite cards come from `dashboardLayouts`, filtered to favorites (or all items if none are favorited).
- Library already supports `type:…` and `collection:…` search filters.
- Collection browsing and type chips already exist in the UI.

## Data model

Extend `AppSettings`:

```ts
interface AppSettings {
  resetSearchOnNavigation: boolean;
  searchEnterBehavior: SearchEnterBehavior;
  pinnedTypes: ContentType[];       // e.g. ["document", "video"]
  pinnedCollections: string[];      // exact collection names, e.g. ["Inbox", "Reading"]
}
```

Defaults:

- `pinnedTypes: []`
- `pinnedCollections: []`

Normalization:

- Drop unknown `ContentType` values.
- Deduplicate while preserving order.
- Keep collection names as stored strings (same as item `collection` field).
- If a pinned collection name no longer appears on any item, still show the pin (empty result is fine) until the user unpins it.

Persistence:

- Browser: existing `mypersonalshelf.appSettings.v1` localStorage key.
- Native: already saved inside app state JSON via `appSettings`.
- Shelf JSON export/restore already carries `appSettings` — no separate migration file needed.

Item pins remain `isFavorite` only.

## UX

### Dashboard layout

1. **Shortcut row** (new): pinned type + collection cards.
   - Shown only when at least one type/collection pin exists.
   - Click → `navigateToView("library")` + set query to `type:<label-or-value>` / `collection:<name>` using the same filter helpers as today (`filterByType` if present, otherwise the same pattern as `filterByCollection`).
   - Cards show localized type/collection label and a small count of matching items (nice-to-have; omit if it clutters).

2. **Pinned items** (existing): unchanged favorite item cards below.

### How to pin / unpin

- **Type**: from library type filter chips (or type badge context) — toggle “Pin to dashboard”.
- **Collection**: from collections view card actions / collection detail — toggle “Pin to dashboard”.
- **Unpin**: same toggle, or a small remove control on the dashboard shortcut card.
- **Order**: array order in settings; optional simple reorder later. First version can append-on-pin and unpin-in-place without drag reorder.

### Copy / i18n

Add keys for pin/unpin type, pin/unpin collection, shortcut section title/hint. Korean + English.

### Empty states

- No type/collection pins → hide shortcut row (do not show empty chrome).
- No item favorites → keep current empty/fallback dashboard behavior for item cards.

## Interaction details

- Type pin query must match existing search parsing (`parseSearchQuery` + `matchesContentType`). Prefer the same string users already type (e.g. localized label if that is how filters work today; otherwise stable type id). Implementation must verify one path and stick to it.
- Collection pin uses exact collection name in `collection:Name` (same as `filterByCollection`).
- Clicking a shortcut should set `activeType` appropriately when pinning a type (optional consistency with type chips), or rely solely on query — prefer mirroring existing filter helpers to avoid divergent behavior.
- `resetSearchOnNavigation` must not wipe the filter immediately after a shortcut click; apply filter after navigation (same order as current `filterByCollection`).

## Customize / settings

Minimal for v1:

- Pins are managed where they are created (library/collections/dashboard unpin).
- No requirement to add a full pin manager in Customize this round.
- Optional: show pinned type/collection lists under Settings or Customize later.

## Testing

- Unit: `normalizeAppSettings` keeps valid pinned types/collections, drops invalid types, dedupes.
- Manual: pin document + Inbox → dashboard shows two shortcuts → click opens library with correct filter.
- Manual: unpin removes card; export/restore preserves pins.
- Manual: offline / empty shelf still loads settings without errors.

## Risks

- Localized type filter strings vs internal type ids — must align with current search command behavior.
- Orphan collection pins after rename: rename flow should update `pinnedCollections` when a collection is renamed (same place items are renamed).

## Acceptance criteria

- User can pin/unpin content types and collections without affecting item favorite semantics.
- Dashboard shows shortcut cards for those pins; click filters library correctly.
- Pins persist across restart (browser + native) and survive shelf JSON restore that includes `appSettings`.
- Tag pins and preview-inside-cards are not required.
