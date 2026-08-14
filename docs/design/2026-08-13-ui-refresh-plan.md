# UI/UX refresh — plan

Date: 2026-08-13
Status: phase 1, 2 and 3 shipped; phase 4 not started

Direction: **a quiet reading room** — Things 3 / Bear rather than Linear or Plex.
Generous whitespace, hierarchy carried by size rather than weight, restrained colour.

## Why the app does not look good

Not a matter of taste. The stylesheet has no system enforcing consistency, and the
numbers show it:

| | now | should be |
|---|---|---|
| font sizes | 28 (px/rem/em mixed) | 7 |
| font weights | 7 (incl. 650, 750, 900) | 3 |
| border radii | 11 | 3 + pill |
| box shadows | 20, mostly used once | 4 |
| hardcoded colours | 42 hex + 27 rgba = 69 | 0 |
| design tokens | 8, five of them user-picked | ~45 |
| px values off a 4px grid (<60px) | 324 of 624 uses (52%) | 0 |

Three consequences worth naming:

1. **No hierarchy.** 13px is used 21 times and 12px 17 times, so headings, body and
   captions are nearly the same size. Nothing tells the eye where to look.
2. **Everything shouts.** `font-weight: 700` appears 21 times. When most text is bold,
   emphasis stops meaning anything.
3. **Two neutral families are mixed.** Shadows and borders use both
   `rgba(31, 41, 37, …)` (warm) and `rgba(55, 64, 78, …)` / `rgba(49, 57, 70, …)` (cool),
   with no rule. The colour temperature changes from screen to screen.

## The colour decision

`ThemeSettings` currently exposes background, surface, text, muted and accent as five
free colour pickers. That is the single biggest reason the app cannot be made to look
good: contrast can always be broken, five-colour palettes are hard even for designers,
and whoever is polishing the details cannot know what screen will actually appear.

Agreed replacement: **curated themes for the four structural colours, accent stays free.**
Personalisation survives, but every combination is one that has been checked.

## Scale is the other long-term blocker

Measured with 1,000 items in the browser preview:

- all 1,000 rows render at once — no virtualisation — for 9,849 DOM nodes
- a single search keystroke blocks the main thread for 28–72 ms

That is a dev build, so production is faster, but the cost grows linearly with the
shelf. Around 3,000 items typing goes visibly choppy. Addressed in phase 4.

---

## Phase 1 — tokens

Values only; layout and structure untouched. Nothing else can be done consistently
until this exists.

### Type

Current sizes cluster at 12–13px, which is too small and too flat for this direction.
The scale moves up and spreads out:

```
--text-xs     11px   metadata, counts
--text-sm     13px   secondary text
--text-base   14px   body
--text-md     16px   card titles
--text-lg     20px   section headings
--text-xl     26px   page titles
--text-2xl    32px   hero

--leading-tight    1.25   headings
--leading-normal   1.5    body
--leading-relaxed  1.7    reader
```

### Weight

Three. The names are semantic so the values can change in one place once the typeface
question below is settled:

```
--weight-normal  400
--weight-medium  600
--weight-bold    700
```

These are values every system font actually has. The finer weights this direction
really wants (550, 680) need a variable font shipped with the app — see below.

### The typeface is not actually loaded

`base.css` asks for Inter, but there is no `@font-face`, no font file in the repo and
no webfont link. Every screen is really being drawn in the system UI font. `base.css`
also sets `font-synthesis: none`, so weights the system font lacks snap to the nearest
one rather than being faked — which means the existing `font-weight: 650` and `750`
already do nothing.

This matters because the reading-room direction leans on its typeface. Deciding it is
part of phase 1, and there are two honest options:

- **Ship a variable font.** It has to be bundled, not fetched — the app is offline-first
  and pulling from Google Fonts would leak the same way link previews would. For a
  Korean-language UI the natural pick is Pretendard, which covers Hangul and Latin in
  one family and is metric-compatible with Inter; Inter alone would leave Korean text
  falling back to Malgun Gothic and mixing two typefaces mid-sentence.
- **Drop Inter from the stack** and design honestly for the system font, accepting that
  Windows, macOS and Linux will differ.

### Space — 4px grid

Padding today is most often `8px 12px`, which is tight for a reading room. The scale
allows for more air where it helps:

```
--space-1  4px     --space-5  24px
--space-2  8px     --space-6  32px
--space-3  12px    --space-7  48px
--space-4  16px    --space-8  64px
```

### Radius

```
--radius-sm    6px    chips, tags, small buttons
--radius-md    10px   cards, panels, inputs
--radius-lg    16px   modals, hero
--radius-full  999px
```

### Elevation — one neutral, four steps

Collapses both existing neutral families into the warm one, which suits paper.

```
--shadow-1  0 1px 2px rgba(38, 38, 34, .05)      resting surface
--shadow-2  0 2px 8px rgba(38, 38, 34, .06)      card
--shadow-3  0 8px 24px rgba(38, 38, 34, .08)     floating panel
--shadow-4  0 24px 64px rgba(38, 38, 34, .14)    modal
```

### Borders and dividers

Derived from the theme's text colour with `color-mix` rather than hardcoded, so they
stay correct when the theme changes:

```
--line-subtle   color-mix(in srgb, var(--app-text) 8%, transparent)
--line-strong   color-mix(in srgb, var(--app-text) 14%, transparent)
```

### How the snap is verified

Rounding 17px to 16px changes the screen, so "byte-identical output" is the wrong
check here. Instead: dump the computed styles of every rendered element before and
after each group, diff them, and confirm every change is one the mapping intended.
Anything unexpected is a bug, not a rounding artefact.

Work proceeds in six commits so each is reviewable:

| commit | files |
|---|---|
| A | `tokens.css` + base, shell, topbar |
| B | dashboard, cards, shortcuts |
| C | lists, library, collections |
| D | customize, forms, layout-editor |
| E | reader, guide |
| F | responsive, drag-drop, bulk-edit, add-content, links |

## Phase 2 — colour

Replace the five pickers with themes. Candidates for the reading-room direction:
paper (warm ivory, default), linen, sepia, mist (cool grey), night, ink.

Each ships as a fixed set of the four structural colours, contrast-checked against
WCAG AA for body text. Accent remains a free picker, validated against the chosen
theme's surface so an unreadable accent is caught rather than saved.

Migration: existing custom colours map to the nearest theme, with the old values kept
in the export so nothing is silently lost.

## Phase 3 — hierarchy, screen by screen

Now that sizes exist, use them. Dashboard first since it is the first impression, then
library, then detail. Expect real layout changes here, not just value swaps.

### Dashboard — done

Measured on a six-item shelf in a 720px-tall viewport, the first item on the shelf did
not appear until **596px down**: the entire first screen was chrome. Three changes:

- the hero band goes. It spent 175px on an eyebrow, a title and a fixed sentence of
  copy, plus four stat buttons — one of which was a link to Customize that the sidebar
  and topbar already offer. Only the counts responded to the shelf, so only the counts
  survive, as one line of text under the title. This also removed the last eight
  hardcoded hex values on the screen, a categorical palette that ignored phase 2's
  themes entirely.
- the section eyebrows go. `dashboardShortcutsTitle` was printed as both the eyebrow
  and the heading — the same words twice, stacked. The count takes that slot instead.
- the activity columns lose their boxes. Shortcut cards, shelf cards and two bordered
  activity panels made three tiers of identical frame; the supporting tier is now
  whitespace and one rule.

First item at 596px → **477px**; page height 1425px → 1277px.

### Shortcuts moved to the sidebar

They were never dashboard content. `filterByTypePin`, `filterByCollection` and
`filterByTag` all end in `navigateToView("library")`, so a shortcut is the library with
a filter — it belongs next to the link to the library. Living on the dashboard also
meant they could only be reached from the dashboard, which is the opposite of what a
shortcut is for.

They are rows now, not cards: a 252px column cannot hold a 160px-minimum grid. Icon,
name, count, at nav-item height; long names ellipsize; the unpin star appears on hover
or focus rather than holding a permanent 36px column.

Two consequences worth remembering:

- the sidebar is sticky and viewport-tall, because the shortcut list is unbounded while
  the nav above it is six fixed items, and only a bounded column lets the list scroll
  instead of growing. Below 720px the sidebar is a horizontal bar, where that height has
  to be undone.
- the old sidebar status panel went with it. It showed the same three numbers as the new
  dashboard header under different words, which read as four metrics rather than three.

### Library — done

Same disease as the hero band, in a smaller box. Both the library and the collections
view set a standing sentence as their `h1` at 27px while the page's real name appeared
only as an `h2` below it — and again in the sidebar, and again in the eyebrow. The
library printed "12 visible" twice in two stacked bordered boxes.

- the dashboard header became the shared `.pageHeader`, and both views moved onto it:
  the page's name as the title, its counts as one line. `.pageIntro` is gone.
- the item list stopped being a stack of cards. Rows sat in sunken pills with 12px of
  air: 81px each, so a twelve-item shelf was 960px and a 720px screen showed four. They
  meet on a hairline at 61px now, and the library, collections and the dashboard's
  activity columns all share it.
- the status strip can be silent. An effect refilled it with `readyNotice` whenever it
  emptied, so a 38px bordered bar of standing copy sat under the topbar for the life of
  the session — and re-announced itself through `aria-live` every time.

First library row at 484px → **371px**; five rows visible instead of four.

- rows show the file name rather than the whole path. Every row used to open with the
  same absolute prefix. `getItemFileName` takes the tail; the detail panel and the search
  index both keep the full path, so searching a folder name that now appears nowhere on
  screen still finds the item.

- the type filter row fits on one line. It needed 742px in a 533px column. Two causes,
  both fixed:
  - each chip carried a 39px pin star as the second half of a joined control, 234px
    across six. Shrinking it could not close a 209px gap, and hiding it in place
    reserves the same width, so it left the flow: a 24px badge in the gap at the chip's
    corner, revealed on hover or focus, with pinned-ness marked by an accent inset
    border on the chip so that pinning something never reflows the row.
  - `contentTypes` was a fixed list of all six, so a documents-and-links shelf still
    offered video, audio, image and folder — filters that could only come back empty.

  82px → 37px. A documents-and-links shelf now uses 208px of the 533px available.

### Detail — done

- the panel was headed "Preview", with the item's own name below it as a `<strong>`
  inside the preview block. The name is the `h2` now, with type and collection under it;
  the panel previously offered no heading for its own subject. The full path moves below
  the preview body — it belongs here, but as reference detail rather than as the line
  under the item's identity.
- the preview block was still on literal paper colours (`#f3efe8` ground, `#28313e`
  text) under a phase-1 note that phase 2 would decide whether a theme may repaint it.
  It never was revisited: on ink the panel is `rgb(24, 27, 31)` and this sat inside it
  as a cream rectangle. On `--surface-sunken` the warm palettes keep a warm block —
  sepia gives `rgb(243, 236, 221)` — and ink reads 18.41:1.

Checked and deliberately left: the action row wraps to two lines at 350px, but the
number of actions varies by type (up to five for a broken-path link), and forcing one
line would mean icon-only buttons. Delete sits in that row at the same weight as the
rest, which is acceptable because it is guarded by a confirm.

### The card — done

The screens above were the page's frame. The dashboard is mostly card, and the
card had not been touched since phase 1 swapped its values, so the screen still
did not look good once the frame was fixed.

**Reference: Raindrop.io.** Picked over Are.na and Notion because it does nearly
the same job — links and uploaded files, in collections, with tags, a built-in
reader, and content-type filters. Its app is open source (`raindropio/app`), so
the notes below come from its source rather than from screenshots.

Two of our assumptions were wrong:

- **its default view is a list, not a grid.** Grid is a per-collection opt-in,
  and its own docs point it at "design inspiration or mood boards", with
  Headlines — text only, no thumbnail — for scanning a lot of text. By that
  rule our shelf of lecture notes, novels and mp3s belongs in a list. We kept
  the grid, because a dashboard that looks like the library has no reason to
  exist, but the grid now has to earn it.
- **its grid works because a cover always exists.** `item/cover/view.js` has no
  no-cover branch: og:image, and failing that a server-rendered screenshot of
  the page. That is a cloud guarantee, and our items are local files with no
  page to screenshot. Four of seven cards on a typical shelf have no image, and
  they are the files — the app's actual subject. So the imageless card is our
  canonical case and the cover is the enhancement, which is the inverse of
  theirs.

What its source gave us that transferred directly:

| taken | from |
|---|---|
| `.description:empty { display: none }`, and every branch of the info line ending in `null` — no placeholder anywhere | `item/view.module.styl`, `item/info/index.js` |
| type icon rendered only when it adds something (`type != 'link'`) | `item/info/index.js` |
| the info line carries the domain, never the URL | `item/info/index.js` |
| actions `display: none` until `:hover` | `item/view.module.styl` |
| `height: 100%` against `grid-template-rows: 1fr` for equal heights | `items/view/grid.module.styl` |
| `auto-fill` columns rather than a fixed count | `items/view/grid.module.styl` |
| cover ratios per view: grid 16:9, list 56×48, headlines 20×20, moodboard free | `item/cover/size.js` |

Our list rows already matched their default view — `grid-template-columns: auto 1fr`
with an inset hairline — which is why the list looked settled and the grid did not.

Changes, in order: the placeholder note goes (it was also being indexed, so a
query for a word in it matched every item without a note); the address block
goes; the two type labels collapse to one metadata line at the foot; the star
and handle become one hover-revealed cluster; the grid follows the width and
caps the thumbnail; the last two literal colours join the palette.

Page height 1277px → **1165px**. Rows now hold one height apiece and the info
lines sit level across each row, which is the one internal line that can align
whether or not a thumbnail sits above it.

Left deliberately: the imageless card starts at its title rather than reserving
an empty media box, which is the no-placeholder rule applied to layout. Six
places still write `{count} {t(unit)}` with a literal space, which reads wrong
in Korean; that needs a formatter on the i18n side.

## Phase 4 — built to be lived in

- virtualise the item list so 5,000 items behave like 50
- surface dead links and let them be fixed or dropped in one pass
- give the dashboard a reason to be returned to rather than a static grid

---

## On references

Worth collecting; not worth redrawing the app in Figma. The problem was never "we do
not know what it should look like" — it is that there was no rule holding it together,
and that is fixed with tokens in code. A Figma file that is not backed by tokens ends
up as 28 font sizes again.

What did work, once the frame was fixed and the card still looked wrong, was reading a
comparable app's source. Things 3 and Bear carried the direction for lists and gave the
list rows their shape, but neither has a card grid, so the card had no target to hit —
which is exactly where the screen stayed ugly. Raindrop supplied that target, and more
usefully supplied the two places its answer does not transfer.
