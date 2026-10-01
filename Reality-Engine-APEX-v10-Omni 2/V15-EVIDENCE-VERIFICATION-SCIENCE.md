# APEX v15 — Evidence-Verified Progress: State-of-the-Art Methodology

## Goal
Make "scan-verified progress vs. claimed schedule" the strongest capability
in this system relative to any comparable tool — not by adding more UI,
but by replacing a simple percentage comparison with published, peer-reviewed
project-controls methodology, correctly implemented and numerically verified.

## The four methods added (`app-realitytwin-science.js`)
All four are real, citable practice — not house-invented heuristics:

1. **Earned Schedule (Lipke, 2003; AACE International Recommended
   Practice)** — the accepted extension to classic EVM that measures
   schedule variance in **time** (days), not %, cost, or an arbitrary
   traffic-light color. Classic Schedule Variance (SV = EV − PV) has a
   well-documented flaw: it mathematically collapses to zero at project
   completion regardless of how late the project actually finished.
   Earned Schedule fixes this by asking "at what point on the *planned*
   progress curve does today's *actual* earned progress correspond to?"
   — giving `SV(t)` and `SPI(t)` that stay meaningful through to the end
   of the project.
2. **Inverse-variance confidence weighting** — the same principle used to
   combine geodetic survey measurements of differing quality: each scan
   session is weighted by `√(control points) / RMS_residual²`, so a
   precise session with many control points properly outweighs a noisy
   one instead of both counting equally in a flat average. Produces a
   weighted mean **and a standard error** — an honest uncertainty band,
   not a bare point estimate.
3. **Statistical significance testing (two-tailed z-test, 95%
   confidence)** — before flagging a divergence between claimed and
   scanned progress as a real problem, the system now asks whether the
   gap is larger than what measurement uncertainty alone could produce.
   This is standard hypothesis-testing practice and prevents the false
   alarms a naive threshold-based comparison generates.
4. **Trend-based completion forecasting (linear regression, R²
   reported)** — a *leading* indicator independent of the current
   schedule: fits a line through the sequence of scan-verified readings
   over time and projects forward to 100%, so a slowing (or
   accelerating) trend is visible before it shows up as a lagging
   schedule variance.

## Built on the project's own real CPM engine — not reinvented
`computeProjectPVCurve()` uses `computeCPMCore()`, already present in
`app-core.js` (forward/backward pass, all four FS/SS/FF/SF relationship
types with lag, already powering the existing Monte Carlo schedule-risk
simulator). This module adds a genuinely new capability — a proper
Planned-Value-over-time curve derived from real network logic — without
duplicating engine code that already existed and was already correct.

## Verified, not just written
No project-controls textbook or reviewer is available in this sandbox, so
every function was checked against a **hand-computed scenario** run
through Node.js directly against the real files:
- A two-task network (10-day + 10-day, FS-linked, 20-day project) with a
  known Planned Value curve: `PV(5)=25%`, `PV(14)=70%`, `PV(15)=75%` — all
  three matched the implementation exactly.
- Earned Schedule at `AT=15` days with `EV=70%`: expected `ES=14`,
  `SV(t)=−1 day`, `SPI(t)=0.933` — matched exactly.
- Statistical divergence: 82% claimed vs. a confidence-weighted 70%
  scanned (combined SE ≈ 6.4 points) → `z=1.87`, correctly **not**
  flagged significant at the 95% threshold (|z| < 1.96) — the test
  behaves as a real z-test should, not as a fixed-percentage alarm.
- Trend forecast: three points constructed to lie exactly on a line of
  slope 2.857%/day → the fitted regression recovered `slope=2.857`,
  `R²=1.000` exactly.
- The full `renderRealityTwinView()` page was then rendered end-to-end
  with realistic multi-session project data (not just the isolated math)
  and confirmed to contain the Earned Schedule figures, the z-test
  verdict, and the trend forecast in the actual generated HTML.
- The complete 41-page, 5-role, syntax + dead-reference + empty-data
  verification suite from v14 was re-run after this change: still 41/41
  and 0/160 crashes.

## What "state of the art" does not mean here
This is the strongest **methodology** available in published project
controls science for this exact comparison. It is not a claim that this
system now out-analyzes a dedicated computer-vision progress-detection
product on raw image/point-cloud interpretation (that is a different,
harder problem — automatically recognizing *which* elements are built
from raw sensor data) — RealityTwin AI's own registration and geometry
comparison (`geometry_compare.py`, `spatial_intelligence.py` in the
separate RealityTwin AI backend) is what still does that recognition. This
module's contribution is making the *comparison against the schedule*,
once a % figure exists, as rigorous as published project-controls
practice gets.
