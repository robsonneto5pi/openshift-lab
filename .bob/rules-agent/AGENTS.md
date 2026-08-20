# Project Coding Rules (Non-Obvious Only)

- Go `redis` package must be imported with alias `rdb` everywhere (`import rdb "github.com/openshift-lab/chat-backend/redis"`)
- `getEnv(key, fallback)` helper exists in both `main.go` and `chat/hub.go` — do not remove either copy; they serve different packages
- Do NOT add `Client` to the online set on WebSocket connect — only on first message (`c.active` gate in `HandleMessage`)
- The `writePump` intentionally batches multiple queued messages into one WS frame separated by `\n`; keep this pattern when modifying send logic
- All frontend JS is IIFE-wrapped, no module system — expose APIs via `window.ChatWS` / `window.ChatUI` globals only
- All files in `chat-backend/.s2i/bin/` **must** use LF line endings — CRLF breaks S2I builds on OpenShift (CI enforces this)
- Run `go mod tidy` after any dependency change; CI fails if `go.sum` is stale (`git diff --exit-code go.sum`)
- All manifests use hardcoded namespace `openshift-lab` — no parameterization
- When adding a new `manifests/*.yaml`, apply it in the correct numeric order (00, 02, 03, 04…) — `deploy.sh` applies them individually, not with `oc apply -k`
- `redis` Deployment uses `strategy: Recreate` due to ReadWriteOnce PVC — do not change to RollingUpdate
- `REDIS_HOST` and `REDIS_PORT` env vars in `manifests/02-golang-sample.yaml` must remain explicit — Kubernetes auto-injects `REDIS_PORT=tcp://...` which breaks the Go app's address construction
- After every S2I build on this cluster, run `oc set image` with the full `image-registry.openshift-image-registry.svc:5000/openshift-lab/<app>:latest` URL — the Deployment does not auto-trigger from the ImageStream
