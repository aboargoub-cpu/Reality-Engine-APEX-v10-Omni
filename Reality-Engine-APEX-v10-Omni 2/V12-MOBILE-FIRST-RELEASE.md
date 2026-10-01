# APEX v12 — Mobile-First Release

## Implemented
- iPhone-first responsive shell with `viewport-fit=cover` and safe-area support for Dynamic Island/Home Indicator.
- Fixed bottom navigation on phones; desktop navigation adapts upward without horizontal scrolling.
- Touch targets are at least 42–48px for primary interactions.
- Dashboard, Projects, Digital Twin and Capture are rendered from the mobile-first shell.
- Portrait and landscape layouts are supported.
- Capture workflow explicitly follows: Project → RCP control points → RCP target → iPhone/iPad capture → QA/independent check → Digital Twin.
- Camera permission is requested before the native capture handoff.
- Native capture handoff supports a URL-scheme launch with a Universal Link fallback contract.
- APEX Commander is hidden from unauthorized users in the mobile UI and blocked in the application router.
- Server-side RBAC was added for `/api/apex/*`; client-side hiding is not treated as security.
- PM1 is explicitly excluded from `apex.commander`, `apex.forecast`, and `apex.ai`.

## Production note
Set `PMS_AUTH_REQUIRED=true` and a strong `PMS_AUTH_SECRET` in production. The local/offline mode intentionally bypasses server authentication for development.

## Native iOS integration
The web shell cannot directly access LiDAR depth. The actual LiDAR capture remains in the native iOS/ARKit scanner, with the web app acting as the authenticated workflow/orchestration layer.
