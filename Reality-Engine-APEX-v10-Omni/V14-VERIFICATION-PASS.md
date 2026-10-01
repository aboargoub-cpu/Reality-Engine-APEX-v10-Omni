# APEX v14 — Full-System Verification Pass

## What was checked (and how — no browser available in this sandbox)
All 35 JS files were loaded in their real `index.html` script order inside
a Node.js `eval` context with a minimal DOM/storage stub, then the actual
application functions were called directly — not rewritten test doubles.

1. **Syntax** — `node --check` on all 35 files individually: all pass.
2. **Duplicate global declarations** — every top-level (column-0)
   `function`/`const`/`let`/`var` name across all 35 files, in load order.
   430 apparent "duplicates" on a naive scan turned out to be almost
   entirely local variables inside functions (`d`, `r`, `x`...); narrowing
   to genuine file-top-level names left 5: `A11`, `nav`, `projects`,
   `save` (all safely scoped inside separate IIFEs in `app-v11-clean.js`/
   `app-v12-mobile.js`, confirmed by inspection — not real collisions) and
   **`setRealityEngineUrl`, twice in the same file** — this one was real
   (see Fixed, below).
3. **Dead-link check** — every `onclick="fn(...)"` handler across all
   files and `index.html` (196 call sites) cross-referenced against every
   defined function: 195 resolved correctly; the 196th was `alert(...)`,
   a browser built-in, not a bug.
4. **Navigation/routing/permission consistency** — `NAV` vs
   `VIEW_RENDERERS`: exactly 41 keys each, perfect 1:1 match (no nav item
   with a missing renderer, no orphaned renderer). Every role's `view[]`/
   `edit[]` array checked against real `NAV`/`MODULES` keys: no typos.
5. **Full page-render smoke test** — every one of the 41
   `VIEW_RENDERERS` functions actually called (not just referenced) with
   representative data covering every collection: 41/41 render without
   throwing.
6. **Fresh-install edge case** — the same 41 pages, this time with every
   data collection empty (`[]`), run once per role (5 roles) against only
   the pages that role can see (41/41/38/20/22 respectively): **0
   crashes** across 160 page-role combinations.

## Fixed
**Stale Reality Engine URL — a real, pre-existing silent bug**, in
`app-digitaltwin.js`. Two parallel config systems existed for the
"scan-vs-BIM" processing server's URL: an early one using a plain
`const REALITY_ENGINE_CONFIG` object, and a later one using
`STATE.realityEngineConfig` (persisted, the one the Settings UI actually
reads and writes via `realityEngineUrl()`/`ensureRealityEngineState()`).
Both defined a function named `setRealityEngineUrl` — in a plain-script,
no-module codebase, the second declaration silently wins for *every*
caller, so the Settings UI's "save URL" always went to the live
`STATE.realityEngineConfig` system correctly. But
**`runRealScanVsBimAnalysis()`** — the actual scan-vs-BIM analysis call —
had been left reading `REALITY_ENGINE_CONFIG.baseUrl` directly: a value
frozen at whatever `localStorage` held when the page first loaded, never
updated again. A user who opened Settings, entered a new server URL, and
saw "تم الحفظ" (saved) would still have every scan-vs-BIM analysis
silently sent to the *old* URL until a full page reload happened to
re-read `localStorage`. Removed the dead first implementation entirely
and pointed `runRealScanVsBimAnalysis()` at the live `realityEngineUrl()`
helper, consistent with every sibling function in that file
(`runControlNetworkCalibration`, `runScanVsScanComparison`, etc., which
were already correct).

## Not found — said plainly
No other functional bugs surfaced in this pass. That is a statement about
what automated checks of this kind can catch (syntax errors, dead
references, routing gaps, and crashes reachable by rendering every page
once with representative and with empty data) — it is not a claim that
every business-logic path (every workflow transition, every financial
calculation, every permission edge case) was exercised; a script cannot
click through 41 pages' worth of forms and buttons the way a person can.
