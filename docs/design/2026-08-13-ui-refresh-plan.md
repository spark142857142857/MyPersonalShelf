# UI/UX refresh — plan

Date: 2026-08-13
Status: phase 1 and 2 shipped; phase 3 in progress (dashboard done)

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

### Library, detail — not started

## Phase 4 — built to be lived in

- virtualise the item list so 5,000 items behave like 50
- surface dead links and let them be fixed or dropped in one pass
- give the dashboard a reason to be returned to rather than a static grid

---

## On Figma

Worth collecting references; not worth redrawing the app. The problem is not "we do
not know what it should look like" — it is that there is no rule holding it together,
and that is fixed with tokens in code. A Figma file that is not backed by tokens ends
up as 28 font sizes again.

One screen — the dashboard — is worth mocking up before phase 3, to settle the
direction cheaply. Everything else follows from the tokens.
