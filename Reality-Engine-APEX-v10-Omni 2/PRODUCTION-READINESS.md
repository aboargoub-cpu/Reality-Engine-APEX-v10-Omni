# Production Readiness — Reality Engine APEX v8

## Must-have before production
- [ ] OIDC / Microsoft Entra ID + MFA
- [ ] Tenant isolation verified at database and API layers
- [ ] PostgreSQL with backups and point-in-time recovery
- [ ] Versioned object storage for PLY/LAS/IFC/document evidence
- [ ] Redis + worker queue for heavy processing
- [ ] WAF/API gateway + TLS
- [ ] Immutable/append-only audit strategy
- [ ] OpenTelemetry traces + centralized logs + SIEM
- [ ] Load test with target concurrency and large point clouds
- [ ] Security review and OWASP ASVS 5.0 verification
- [ ] iOS Universal Link / app integration tested on real devices
- [ ] Offline sync conflict tests
- [ ] BIM/IFC validation tests
- [ ] Reality capture accuracy validation against a survey-grade reference
- [ ] Disaster recovery exercise
