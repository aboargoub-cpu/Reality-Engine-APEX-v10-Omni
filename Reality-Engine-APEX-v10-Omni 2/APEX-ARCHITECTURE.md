# Reality Engine APEX — Enterprise Architecture

## Product direction
Reality Engine APEX is designed as an enterprise project intelligence platform rather than a task tracker. The architecture follows value delivery, governance, schedule, finance, stakeholders, resources and risk domains from PMI's PMBOK 8, information management principles from ISO 19650, OWASP ASVS 5.0 application security, and NIST AI RMF for trustworthy AI.

## Operating model
1. Executive command center
2. Portfolio / program / project control
3. Integrated schedule + EVM + risk
4. Commercial / procurement / claims
5. Field execution + HSE + QA/QC
6. Document and correspondence control
7. BIM / IFC + reality capture + digital twin
8. Control network + robust registration + independent checkpoints
9. AI copilot with explainable fallback rules
10. Governance, approvals, delegation and immutable audit strategy

## APEX principles
- Evidence before inference.
- AI recommends; accountable humans approve high-impact actions.
- Every critical metric should be traceable to a source record.
- Separate preparation, review and approval for controlled transactions.
- Prefer independent check points for reality-capture calibration.
- Offline-first at field edge, synchronized when connectivity exists.
- Treat BIM, documents, scans, decisions and schedule records as one information ecosystem.

## Production target
For a production deployment, replace local JSON/auth with PostgreSQL, object storage, OIDC/Entra ID, MFA, Redis/job workers, WebSocket event delivery, immutable audit storage, observability (OpenTelemetry), secrets management and policy-as-code. The present package keeps the local/offline architecture usable while providing explicit seams for those services.
