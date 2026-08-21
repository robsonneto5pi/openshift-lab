# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-08-21

### 🚀 Features

- **Phase 1a — UUID session identity** ([#8](https://github.ibm.com/robson-neto/openshift-lab/pull/8), [#9](https://github.ibm.com/robson-neto/openshift-lab/pull/9))
  - Immutable UUID assigned per WebSocket connection, stored in `sessionStorage['chat:userId']`
  - Auto-discriminator `#XXXX` for duplicate nicknames — detected at connection time via `chat:reserved` Redis set
  - Welcome envelope: server sends `{ type: "welcome", user, userId, requestedAs }` immediately on connect
  - Frontend handles `welcome` case: updates `myNick`, stores UUID, shows nick-notice banner

- **Phase 1b — Server-side mention detection** ([#7](https://github.ibm.com/robson-neto/openshift-lab/pull/7))
  - Backend detects `@nick` and `@Base` mentions against the live online set
  - `mentions[]` field included in every message envelope
  - Resolves discriminated nicks: `@Robson` matches `Robson#4821` if online

- **Phase 1c — Notifications** ([#6](https://github.ibm.com/robson-neto/openshift-lab/pull/6))
  - Tab title badge: `(N) OpenShift Chat` for unread messages, `(!) OpenShift Chat` for mentions
  - Mention highlight with yellow border on message bubble
  - Mention sound via Web Audio API (synthesized tone, no audio file required)
  - Mute toggle persisted in `localStorage`
  - Unread counter resets on tab focus + scroll-to-bottom

- **Leave Room button** ([#5](https://github.ibm.com/robson-neto/openshift-lab/pull/5))
  - Sends `{ type: "leave" }` to server before closing WebSocket
  - Server broadcasts system message, removes from `chat:online` and `chat:reserved`
  - Frontend resets to login screen, clears `sessionStorage`

### 🐛 Bug Fixes

- **fix(ci)**: Use `git archive --from-archive` in S2I builds; fix `working-directory` paths ([#10](https://github.ibm.com/robson-neto/openshift-lab/pull/10))
  - Replaces `--from-dir` which caused CRLF line endings breaking S2I `assemble` script on OCP
  - Adds `oc set image` after each build (cluster quirk: `latest` tag not auto-resolved)
  - Fixes path references: `openshift-lab/chat-backend` → `chat-backend`

- **fix(deploy)**: Add `git-archive-lf.js` to prevent CRLF in S2I scripts on Windows
- **fix(deploy)**: Use `HEAD:subdir` syntax in git archive — correct tar structure without path prefix
- **fix(frontend)**: Add SVG data URI favicon — eliminates 404 on `favicon.ico`
- **fix(security)**: Remove hardcoded credentials from tracked files

### 🏗️ Infrastructure

- OpenShift 4.19 on IBM TechZone (`itz-1y1puu`, Frankfurt fra02)
- S2I binary builds: `golang:1.18-ubi9` + `nginx:1.24-ubi9`
- Redis with `ReadWriteOnce` PVC, `strategy: Recreate`
- HTTPS edge TLS via OpenShift Router, WebSocket upgrade via nginx proxy
- GitHub Actions workflows: staging deploy on `develop` push, production with manual approval gate on `main`

### 📦 Stack

| Layer | Technology |
|---|---|
| Backend | Go 1.18, Gin 1.9, Gorilla WebSocket, go-redis/v8 |
| Messaging | Redis Pub/Sub (`chat:global`) |
| Persistence | Redis Lists + Sets |
| Frontend | Vanilla JS / HTML / CSS — no framework |
| Web server | Nginx 1.24 UBI9 |
| Platform | OpenShift Container Platform 4.19 |
| Build | S2I (Source-to-Image) binary builds |

---

[1.0.0]: https://github.ibm.com/robson-neto/openshift-lab/releases/tag/v1.0.0
