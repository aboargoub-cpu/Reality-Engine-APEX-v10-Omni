# APEX v22 — The Actual Root Cause: a Global Class Name Collision

## What was really happening
Not `position:fixed`. Not the FAB. Not sticky headers. A **CSS class name
collision** between two completely unrelated things that both happened to
be named `.p4`:

1. `.p4{padding:16px}` (`styles.css` line 129) — a general-purpose padding
   utility class, used **215+ times** in `app-views.js` alone (plus more
   across `app-ui.js`, `app-main.js`, `app-digitaltwin.js`,
   `app-realitytwin.js`), almost always as `class="frame p4"` — a card
   with standard padding. This is one of the most common class
   combinations in the entire codebase.
2. `.p4{right:31%;top:35%}` (`styles.css`, inside the old `app-v9-ultimate`
   experimental shell's CSS block) — one of four decorative dot positions
   (`.p1`–`.p4`) for a "scan target" diagram illustration, meant to be
   combined with `.point{position:absolute}` as `class="point p4"` in
   exactly one place (`app-v9-ultimate.js`'s twin-canvas visualization).
   It was never scoped or prefixed, so as a bare global class selector it
   matches **every** `.p4` anywhere on the page, not just the one dot it
   was written for.

Both rules load from the same `styles.css`, so both apply to any element
carrying `class="... p4 ..."`. They don't share any property names, so
CSS doesn't have to choose between them — an element gets `padding:16px`
**and** `right:31%; top:35%`. The second part only visually does anything
on a positioned element — and `.frame{position:relative}` (the class
almost always paired with `p4`) is exactly that. Net effect: essentially
every `class="frame p4"` box in the entire application — hundreds of
them, on nearly every page — was being shoved 31% right and 35% down from
its normal position, landing on top of whatever content followed it in
the page flow. That's the "boxes hiding other boxes" reported from the
very first screenshot, and why it reproduced identically in the minimal
isolated diagnostic page (which also uses `class="frame p4"` for its note
boxes), in real Chrome, in both mobile and desktop layout modes — none of
which are scoped by viewport or browser, because the bug had nothing to
do with any of that.

## Why the earlier fixes (v19–v21) didn't help
They were reasonable hypotheses (FAB clearance, then a defensive
`position:static!important` on `.kpi`/`.kpi-grid`) but none of them
touched `.p4` — and the boxes actually being displaced were mostly the
plain `class="frame p4"` **note/info boxes**, not the `.kpi` cards
themselves. The kpi cards just happened to be what ended up visually
covered, since the displaced note box lands wherever its 31%/35% offset
puts it — often right on top of the content immediately below.

## The fix
Renamed the four decorative diagram classes to `.pt1`–`.pt4` (scoped,
collision-free) in both places they exist:
- `styles.css`: `.p1{...}.p2{...}.p3{...}.p4{...}` → `.pt1{...}.pt2{...}.pt3{...}.pt4{...}`
- `app-v9-ultimate.js`: `class="point p1"` … `class="point p4"` →
  `class="point pt1"` … `class="point pt4"` (the only place these were
  ever used)

`.p4{padding:16px}`, the real, widely-used utility class, is now the only
rule with that name and is completely untouched — confirmed by grep
(215 usages in `app-views.js` still intact, zero `.p1`–`.p4` bare
selectors left besides it).

## Verification
- `grep -o "\.p[1-4]{[^}]*}" styles.css` now returns exactly one match:
  `.p4{padding:16px;}` — the collision is gone.
- `app-v9-ultimate.js` syntax-checked clean; no remaining
  `class="point p1..4"` references anywhere.
- Full 41-page / 5-role / empty-data suite re-run: still 41/41, 0/160
  crashes.
- This is a pure CSS selector-scoping fix — there is no way to
  mechanically prove the visual overlap is gone without a real browser,
  which this sandbox still doesn't have. What can be stated with full
  confidence is the *mechanism*: no rule anywhere in the stylesheet can
  now apply an unwanted `right`/`top` offset to a `class="frame p4"`
  element, because the only remaining rule matching `.p4` sets `padding`
  alone.

## A note on process
This took five rounds of wrong or incomplete hypotheses (FAB clearance,
`position:fixed` audits, a defensive override) before the isolated
diagnostic test page — reproducing the bug with nothing but `styles.css`
and a handful of divs — narrowed the search enough to grep every single
CSS rule touching the exact classes involved and actually spot the
duplicate `.p4` definition sitting in a 2000-character-long minified CSS
line, which is why simple earlier greps for `position:fixed` never
surfaced it: the offending rule doesn't use `position` at all, it just
relies on an ambient `position:relative` from `.frame` that was already
there for an unrelated reason.
