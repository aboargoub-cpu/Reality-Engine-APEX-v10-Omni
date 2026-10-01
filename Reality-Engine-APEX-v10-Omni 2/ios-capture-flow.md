# iOS Capture — Exact Field Procedure

### What the surveyor sees
**1. Select Project → 2. Place RCPs → 3. Print Target → 4. Open iPhone Scan → 5. Verify → Publish**

### RCP physical rule
The printed circle/cross is only a visual recognition target. The coordinate is the exact crosshair center.

### Minimum recommended arrangement
RCP-001: origin (0,0,0)
RCP-002: known X/Y/Z
RCP-003: known X/Y/Z
RCP-004: independent check point

The points should surround the area and have useful geometric spread. Do not put all points on one line.

### iPhone app behavior
The app should show:
- camera/LiDAR preview
- "RCP-001 FOUND"
- distance and confidence
- next required point
- progress 1/4, 2/4, 3/4, 4/4
- then "SCAN AREA"
- then "FINISH & RETURN"

The browser must not pretend it can silently open another app. Production uses Apple Universal Links and iOS permissions.
