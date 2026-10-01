# Reality Engine RCP-01 Reference Target Specification

## Purpose
The target is a visual/geometry reference marker for iPhone LiDAR capture. It is not a substitute for a survey monument.

## Recommended physical target
- A4 (210 × 297 mm) for ordinary room/site capture.
- Print at 100%; disable Fit to Page.
- Use matte lamination to reduce glare.
- Mount flat on a rigid board/wall.
- The **reference point is the exact center of the crosshair**, not the paper corner.
- The printed RCP ID is only an identifier; the geometric center is the control point.

## Placement
- Minimum 4 targets for a normal room/area.
- Place them around the perimeter, with good depth/height variation when possible.
- Never place all targets on one straight line.
- One point may be the coordinate origin; one or more can be independent check points.
- Record the real XYZ coordinate of each target center in the project's chosen coordinate system.

## Scan capture
During the iPhone scan, view each target from multiple angles. The capture package should return:
- point cloud (PLY/LAS/LAZ when supported)
- control_points.json
- marker ID
- scan-space XYZ for marker center
- confidence
- timestamp/frame reference

## Calibration
The server performs a robust 3D similarity transform:
Scale + Rotation + Translation.
A check point is excluded from fitting and used only for validation.
Publishing is blocked if the configured quality gate is not met.

## iOS handoff
The web app cannot bypass iOS permission prompts or silently force another app to open.
Production integration should use Universal Links (preferred) or a registered custom URL scheme.
The handoff payload should include:
projectId, captureSessionId, requestedControlPointIds, returnURL.
