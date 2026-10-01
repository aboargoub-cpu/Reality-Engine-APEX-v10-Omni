# APEX v11 — Complete UI Redesign

The previous shell is superseded by a single adaptive layout system.

## Non-negotiable rules
- No absolute-positioned primary controls.
- No overlapping fixed desktop and mobile navigation.
- One content column on mobile; two/three columns only when width permits.
- Safe-area aware mobile bottom navigation.
- 44pt-class touch targets and generous spacing.
- Progressive disclosure: operational screens show only the current task.
- Desktop uses a persistent sidebar; mobile uses a bottom navigation.
- Digital Twin uses canvas + detail rail on desktop and canvas-first stacking on mobile.
- Field capture is a linear wizard with exactly one primary action per step.

## Validation matrix
Test at minimum:
- iPhone SE class / 320px
- iPhone 13/14/15/16 class / 390-393px
- iPhone Pro Max class / 430-440px
- tablet / 768-1024px
- laptop / 1280px
- desktop / 1440-1920px
- portrait + landscape
- large text / dynamic type
- Arabic RTL and English LTR

The redesign follows adaptive layout, safe-area, spacing, reflow and progressive-disclosure principles from Apple HIG and Microsoft Fluent. It deliberately avoids shrinking a desktop UI into a phone UI.
