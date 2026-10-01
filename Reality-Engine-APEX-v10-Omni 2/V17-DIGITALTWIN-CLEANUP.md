# APEX v17 — Digital Twin Tab Cleanup

## Removed: the "Scan-vs-BIM" sub-tab cluster — a real, confirmed duplicate
Full audit of "التوثيق الرقمي والرصد الذكي" (Digital Twin) — 15 sub-tabs,
~2500 lines — found one genuine duplication: the `scanbim` sub-tab and its
supporting functions (`runRealScanVsBimAnalysis`, `runScanCalibration`,
`runScanToScanComparison`, `runBimProgressAnalysis`,
`renderRealityCalibrationResult`, `renderRealityCompareResult`,
`renderBimProgressResult`, `renderRealScanVsBimPanel`,
`ensureRealityEngineState`, `realityEngineUrl`, `setRealityEngineUrl`,
`realityEngineHealth`, `persistRealityEngineReport` — 422 lines total)
called a **separate, never-configured "Reality Processing Engine" server**
(`/api/reality/analyze`, `/api/reality/compare-scans`,
`/api/reality/calibrate`, `/api/reality/control-networks`,
`/api/reality/bim-progress`), defaulting to `http://localhost:8787` — not
RealityTwin AI's real backend (different API paths entirely), and nothing
a real user would have running. Now that the dedicated **RealityTwin**
tab (v13+) does this exact job — LiDAR capture, Horn/RANSAC registration,
IFC deviation tracking — against an app and backend that actually exist,
this whole cluster was a duplicate of a feature area, built around a
connection that was never real. Removed entirely; the tab button, the
dispatch branch, and the overview page's description text were all
updated to match.

### A second duplicate-declaration bug this removal surfaced
Also found (before v16's RealityTwin capture-flow work) that
`runRealScanVsBimAnalysis` itself had **two separate definitions** in the
same file — an earlier one at the top of the block (which v14's fix had
corrected) and a second, near-identical one further down that silently
overrode it. Since the whole block is now deleted, this is moot, but it's
recorded here because it confirms the same "leftover duplicate
implementation" pattern found and fixed in v14 (`REALITY_ENGINE_CONFIG`)
was not fully caught the first time — the automated duplicate-declaration
scan only checks by name across *files*, not by re-scanning within a
single file for a second definition of the same name lower down. Worth
knowing as a real limitation of that check, not just a one-off.

## Kept, per explicit instruction: the Autodesk BIM viewer — now with real setup steps
The `bimviewer` sub-tab (Autodesk Platform Services 3D viewer) is not a
duplicate of anything else in this system and does real work once
configured — it was left in place. What changed is the in-page
instructions: instead of one paragraph explaining *why* it needs external
credentials, it now has a numbered 5-step walkthrough (create an APS
account → create an App for Client ID/Secret, once → upload and translate
the model for a Model URN, once per model → obtain an hourly Access Token
→ paste Token and URN here) with an explicit warning never to paste the
Client Secret into this page — only the short-lived Token, which is the
only thing this page ever needs.

## Verification
Full re-run of the v14/v16 suite after this change: 41/41 pages render
with representative data, 0/160 crashes across 5 roles with empty data,
no dead `onclick` references, and — this time — a proper file-by-file
scan for genuine top-level name collisions across all 35 scripts in real
load order, which caught one more real issue: `app-realitytwin-science.js`
had declared its own `linearRegression`, silently colliding with (and
overriding) an existing, differently-shaped `linearRegression` already in
`app-financial.js` used for EAC forecasting. Renamed to
`rtLinearRegressionWithR2` (it needs to return R², the existing one
doesn't) to remove the collision rather than risk either caller silently
getting the wrong implementation.
