# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> ⚙️ From v1.0.0 onwards this file is **auto-generated** by
> [semantic-release](https://semantic-release.gitbook.io) — do not edit manually.

---

## [Unreleased]

### Added
- Real-time chat MVP on Red Hat OpenShift 4.19
- Go backend (Gin + Gorilla WebSocket + go-redis/v8)
- Nginx frontend (HTML5/CSS3/JS vanilla, dark theme)
- Redis 7 Pub/Sub + history (LRANGE) + presence (SASET) + rate limiting
- S2I builds via `oc start-build --from-dir`
- Health endpoints: `/health` and `/ready`
- Multi-user simulation script (`scripts/simulate-chat.js`)
- Pre-build checklist (`docs/pre-build-checklist.md`)
- CI/CD pipeline with GitHub Actions + semantic-release

[Unreleased]: https://github.com/your-org/WatsonBIL4/compare/HEAD...HEAD
