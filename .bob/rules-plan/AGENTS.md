# Project Architecture Rules (Non-Obvious Only)

- Multi-replica horizontal scaling is supported by design: all state (history, online list, rate limits, broadcast) lives in Redis — the Go app is stateless
- Broadcast path: client WS → `Hub.HandleMessage` → `redis.Publish(chat:global)` → Redis PubSub → `Hub.subscribeRedis` → `Hub.broadcast` channel → all local clients. A message always goes through Redis even within a single replica
- `Hub.subscribeRedis` reconnects automatically on channel close with 2s backoff — any refactor must preserve this loop
- Rate limiting is per-nickname per-minute (Redis key `ratelimit:<nickname>`, TTL 60s) — it is NOT per-connection; a user reconnecting with the same nickname inherits the existing rate counter
- History is stored newest-first (LPUSH) then reversed on read — if you change the storage direction you must update both `PushHistory` and `sendHistory`
- `chat-frontend` has zero build tooling — routing, bundling, and transpiling are non-goals; keep it static
- S2I builds are triggered with `--from-dir` pointing at the subdirectory (`chat-backend/` or `chat-frontend/`), not the repo root — the BuildConfig source Git URI is used only for the initial setup, not for CI deploys
- Production deploy requires a GitHub environment named `production` with manual reviewer approval configured — the workflow will hang waiting for approval otherwise
- `develop` branch → staging (auto); `main` branch → semantic-release tag + production gate (requires `OPENSHIFT_PROD_TOKEN` secret)
- **TechZone fra02 cluster constraint**: the internal registry (`image-registry.openshift-image-registry.svc:5000`) comes disabled (`managementState: Removed`) — must be activated before S2I builds. The `deploy.sh` script handles this automatically. Git-triggered builds produce `InvalidOutputReference` even after the registry is active; only `--from-dir` binary builds work reliably.
- **ImageStream trigger not wired**: Deployments on this cluster do not auto-rollout when the ImageStream tag is updated — `oc set image` must be called explicitly after every build.
