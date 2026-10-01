# APEX v20 — The FAB Overlap Was a Global Bug, Not a RealityTwin One

## What v19 got wrong
v19 fixed the floating "+" button overlap by adding a 96px spacer to the
bottom of RealityTwin's two panels specifically. That was treating a
symptom, not the cause — and the very next screenshot proved it: the
exact same overlap on **مستخلصات المقاولين من الباطن** (Subcontractor
Certificates), a page this project never touched.

## The real root cause
Every page in the app (all 41 of them, dispatched through
`VIEW_RENDERERS[STATE.active]`) renders inside one single, universal
wrapper: `<main class="content">` (`app-main.js`, `renderShell()`). Its
padding is defined **once**, globally, in `styles.css`:
- Desktop: `.content{padding:20px}` — no bottom reservation for the FAB
  at all.
- Mobile (`@media max-width:860px`): `.content{padding:12px 12px 76px
  12px}` — 76px reserved, but the FAB itself
  (`.fab-container{bottom:78px}` at that same breakpoint, `.fab-main`
  56px tall) needs at least 78+56=134px of clearance just for its own
  closed button, before any margin. **76px was never enough on any page
  that used it** — RealityTwin wasn't a special case, it was simply the
  first page anyone happened to screenshot.

35 separate call sites use `renderModuleView` (the generic searchable
table + record actions component) across the app, each one a candidate
for exactly this overlap whenever its content — or a `kpi-grid` summary
placed after it, as on the Subcontractor Certificates page — reaches the
bottom of the viewport. Patching pages one at a time was never going to
catch all 41 of them reliably, and already didn't.

## The actual fix
Two one-line changes, both in `styles.css`, both apply to literally every
page in the app at once:
- `.content{padding:20px 20px 110px 20px}` (desktop) — was `padding:20px`.
- `.content{padding:12px 12px 150px 12px}` (mobile) — was `...76px...`.

150px on mobile is sized for the FAB's **closed** state (78px position +
56px button + margin) — not for when a user has tapped it open and its
action list temporarily overlays content above it, which is the normal,
expected behavior for this kind of speed-dial control (the same way
Gmail's compose FAB, for example, is expected to sit over content when
its menu is open) and not something padding should try to prevent.

The 96px spacers added to RealityTwin's two panels in v19 are now
redundant but harmless (a little extra breathing room at the bottom of
those two pages specifically) — left in place rather than removed, since
removing them serves no purpose and re-touching that file isn't free.

## Verification
Full 41-page / 5-role / empty-data suite re-run after the CSS change:
still 41/41 pages render, 0/160 crashes across roles with empty data.
This particular fix is a CSS layout change with no way to verify visual
non-overlap without an actual browser (this sandbox has none) — what was
verified is that nothing about the page-render logic itself broke, which
a CSS-only change wouldn't be expected to affect. The genuine test of
"no more overlap" is visual, in a real browser, on the pages already
flagged plus a spot-check of a few more `renderModuleView`-based pages
(invoices, risks, tasks) to confirm the fix's universality.
