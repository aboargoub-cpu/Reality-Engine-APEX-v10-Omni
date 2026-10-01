# Reality Engine APEX v9 Ultimate

## Product decision
APEX v9 is a role-based Project Operating System, not a screen-heavy project tracker.

### Four primary modes
- Executive — portfolio health and decisions.
- Project — schedule, EVM, risk, change, commercial and delivery.
- Field — guided iPhone capture and field workflows.
- Digital Twin — reality/BIM/quality/progress.

Everything else is secondary and should be reached contextually.

## iPhone handoff
Preferred production flow:
1. Web starts capture session.
2. System generates session ID and requested RCP IDs.
3. Web opens iOS Universal Link.
4. iOS asks for required permissions.
5. Capture app scans and recognizes RCP targets.
6. App returns a signed capture package.
7. Server validates package and computes robust similarity transform.
8. Independent check point is evaluated.
9. Human approves publish.
10. Corrected scan becomes a Digital Twin revision.

The browser cannot bypass iOS permission prompts or silently force another app to open.

## Reference target
- A4 210 × 297 mm.
- Print at 100%; no fit-to-page.
- Matte surface recommended.
- Rigid, flat mounting.
- Reference coordinate is the exact center of the crosshair.
- Minimum four distributed points for normal room/site capture.
- At least one independent check point should be excluded from the fitting set.

## Transform
Use robust 3D similarity transform (7 parameters):
- translation XYZ
- rotation Rx/Ry/Rz
- scale

Reject gross outliers; report residuals and check-point error. Do not claim survey-grade accuracy from phone LiDAR alone.

## Governance
AI can detect, explain, forecast and recommend. High-impact actions require accountable human approval.

## Reference alignment
The information-management approach is aligned conceptually with ISO 19650 lifecycle information management, while security targets OWASP ASVS 5.0 and AI governance follows NIST AI RMF principles.
