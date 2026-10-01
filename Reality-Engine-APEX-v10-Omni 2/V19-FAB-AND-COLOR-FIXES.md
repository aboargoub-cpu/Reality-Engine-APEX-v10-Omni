# APEX v19 — RealityTwin: FAB Overlap, Contextual Quick Actions, System Colors

## Fixed: floating "+" button covering content
`.fab-container` is `position:fixed; bottom:24px`, global across every page
by design — other pages already reserve bottom space for it (e.g.
`.a10-main{padding-bottom:85px}`, `.m12-app{padding-bottom:calc(76px+...)}`).
The two new RealityTwin panels (evidence/science cards and the capture
view) never did, so the FAB sat on top of the last visible card — exactly
the "boxes hiding under boxes" reported, confirmed from the screenshots
(the FAB circle sitting directly over the RCP-002 Scan button). Added a
96px spacer at the end of both panels, the same pattern already used
elsewhere in this codebase for the same reason.

## Fixed: the "+" button showed "New Project" inside RealityTwin
`TAB_QUICK_ACTIONS` already existed as a real, working system — every
other tab (invoices, risks, schedule, etc.) gets 3 curated actions instead
of the role's dashboard defaults once you leave the home page. `realityTwin`
was simply never added to that map, so it silently fell through to the
generic fallback, which for a PM/GM role includes "مشروع جديد" (new
project) — not a bug in the FAB system itself, a missing entry for the
newest tab. Added:
- 📷 بدء مسح جديد — switches to the capture sub-tab
- 📊 الأدلة والمطابقة — switches to the evidence sub-tab
- ⇪ تصدير الأدلة إلى التوثيق الرقمي — runs the export directly, no navigation

This needed two small, backward-compatible extensions to `runFabAction()`
(every existing tab's actions are untouched):
- `action.setState: {key, value}` — sets a `STATE` field (e.g. the
  RealityTwin sub-tab) before navigating, so the page lands on the right
  sub-tab in one render, no flicker.
- `action.customAction: "fnName"` — calls a named global function directly
  instead of the default "navigate then open an add-modal" behavior, for
  actions like Export that aren't a record-creation form.

## Fixed: RealityTwin capture screen colors now match the system
Replaced the invented teal palette (`#2DD4BF`/`#34D399`/`#F5A623`) with
colors derived from the system's real design tokens
(`--accent:#4F46E5`, `--good:#16A34A`, `--warn:#D97706`): the primary
"Save & start scan" button and the default Scan-button state now use the
system's actual indigo accent (`#4F46E5`), the "scanned" success state uses
green tied to `--good`, and the "not yet measured" label uses amber tied to
`--warn` — all lightened appropriately for readability on the intentionally
dark field-capture background, which stays dark (a deliberate, separate
design choice from the rest of the system's light theme, kept because it's
a high-glare field screen, not a desk screen).

## Verification
Full 41-page / 5-role / empty-data suite re-run: still 41/41, 0/160
crashes. New targeted test: exercised `runFabAction` for all 3 RealityTwin
actions as both PM and Site Engineer (correct sub-tab switching, correct
direct function call for export, no unwanted navigation) and confirmed an
Accountant — who has no RealityTwin access — correctly falls back to their
own role defaults instead of seeing RealityTwin actions at all. Duplicate-
declaration and dead-onclick-reference sweeps: both still zero.
