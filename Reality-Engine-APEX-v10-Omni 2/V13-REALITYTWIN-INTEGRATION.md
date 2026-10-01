# APEX v13 — RealityTwin Integration

## What this is
A new, dedicated top-level tab — **RealityTwin** — separate from the existing
"التوثيق الرقمي والرصد الذكي" (Digital Twin) tab, as explicitly requested.
It is the bridge to the actual RealityTwin AI native app (iPhone LiDAR
capture + a real Horn/RANSAC registration engine + a verified CPM
scheduling engine), not a duplicate of the existing generic Digital Twin
module, which stays exactly as it was for any other external capture
service.

## Why a separate tab, wired the way it's wired
This codebase already had almost everything needed for this integration,
just not connected:
- `realityCaptures` / `deviationReports` collections and their Digital
  Twin UI already existed.
- `PMS_EXTERNAL_RESULT_SCHEMA_VERSION` + `buildExternalResultImportPreview`
  + `applyExternalResultImport` (in `app-digitaltwin.js`) already defined a
  complete, working import contract for exactly this kind of external
  evidence — previously reachable only through a manual file
  export/import round trip.
- `computeTaskWeightedCompletion(projectId)` (in `app-digitaltwin.js`)
  already computed a real, task-weighted tracked-progress figure —
  previously only compared against a certificate's claimed %, never
  against RealityTwin's scan-verified %.

So this release adds the missing piece — a genuine source of RealityTwin
evidence and a direct (no file round-trip) call into the existing import
pipeline — rather than re-inventing any of the above.

## Added
- **`app-realitytwin.js`** (new file): `renderRealityTwinView()`,
  `computeRealityTwinScheduleCrossCheck()`,
  `exportRealityTwinEvidenceToDigitalTwin()`.
- **`realityTwinSessions`** collection + `realityTwinSessionFields()` (in
  `app-modules.js`): one row per LiDAR capture session — control points
  used, RMS residual, registration algorithm, IFC comparison max
  deviation (mm), scan-verified progress %, evidence hash, status.
- **NAV entry** `realityTwin` (in `app-core.js`), positioned directly after
  `digitalTwin` in the same "التوأم الرقمي والجدولة" group.
- **Role access**: added to `مدير المشروع` (PM) and `مهندس الموقع` (Site
  Engineer) view/edit arrays. `مالك الشركة`/`مدير عام` (Owner/GM) get it
  automatically via `ALL_KEYS`. `المحاسب العام` (Accountant) intentionally
  excluded — not relevant to their role.
- **Schedule cross-check panel**: compares each project's
  `computeTaskWeightedCompletion()` (tracked from task data) against the
  average `scanVerifiedProgressPct` across that project's RealityTwin
  sessions — flags real divergence (`good` / `warn` / `danger` by
  magnitude), the same discipline `computeProgressVerification` already
  applies to certificates, now applied to RealityTwin evidence directly.
- **"⇪ تصدير الأدلة إلى التوثيق الرقمي"**: builds a
  `PMS_EXTERNAL_RESULT_SCHEMA_VERSION` "1.0" payload from
  `realityTwinSessions` and calls `applyExternalResultImport()` directly
  in the same running page — no manual file export/import step.

## Fixed during this integration (caught before shipping, not after)
`findModuleKeyByCollection` maps a collection to its permission key via
`subTabPermissionMap` for any collection that is a sub-tab of one page
rather than its own nav entry (the pattern this codebase already uses for
`realityCaptures`, `arSessions`, etc., and already documents as fixing a
real prior bug of the same shape). `realityTwinSessions` needed the same
entry — without it, `canEdit(role, "realityTwinSessions")` would have
checked a permission key nothing in `ROLE_CONFIG` grants, silently
blocking every role, PM and Site Engineer included, from ever adding a
session. Added `realityTwinSessions: "realityTwin"` to that map.

## Verification
No browser is available in this sandbox, so this was verified by loading
the actual, unmodified application files (in their real `index.html` load
order) into a Node.js `vm`/`eval` context with a minimal DOM/storage stub,
then exercising the real code paths directly — not a rewritten test
double:
- `canEdit('مدير المشروع', 'realityTwin')` and
  `canEdit('مهندس الموقع', 'realityTwin')` → `true`;
  `canEdit('المحاسب العام', 'realityTwin')` → `false`.
- `MODULES.realityTwinSessions.add(...)` — real permission check, real
  `uid()`, real `logAudit()`, real `saveData()` call path — produced a
  correctly-shaped stored row.
- `renderRealityTwinView()` executed against real app state and produced
  real HTML containing the KPI grid and the added session's id.
- `exportRealityTwinEvidenceToDigitalTwin()` executed the real
  `buildExternalResultImportPreview` → `applyExternalResultImport` path
  and correctly populated `STATE.data.realityCaptures` and
  `STATE.data.deviationReports` with the expected fields.
- A first pass had a bug (`deviationPct: 0` implicitly read as "no
  deviation" when a real 31mm deviation existed with no percentage
  available) — caught in this verification and fixed by putting the real
  mm figure in `actualValue` explicitly instead of leaving it only in a
  discarded field.
- IndexedDB errors in the Node console during this test are expected
  (Node has no IndexedDB) and are unrelated to this change — the real app
  runs in a browser where it works normally.

## Still not done (said plainly, not left implicit)
This wires the *data contract* between RealityTwin and this PMS. It does
not, by itself, connect to a live RealityTwin AI backend over the network
— `realityTwinSessions` rows are entered the same way every other module
in this offline-first app is (manually, or via a future automated
connector), consistent with this system's stated "no internet required"
design. A live sync (this app calling the RealityTwin FastAPI backend's
`/api/v1/schedule/variance`, `/api/v1/reports`, etc. directly) is a
separate, larger change this release does not include.
