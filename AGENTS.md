# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Stack

- **Backend**: Go 1.18+ (`chat-backend/`) — Gin HTTP, Gorilla WebSocket, go-redis/v8
- **Frontend**: Vanilla JS (`chat-frontend/`) — no framework, no bundler, plain HTML/CSS/JS
- **Infrastructure**: OpenShift 4.x via YAML manifests (`manifests/`) + `oc` CLI
- **Release**: semantic-release from root `package.json` (Node ≥20)

## Commands

### Backend (run from `chat-backend/`)
```bash
go build ./...            # compile check
go vet ./...              # lint
go mod tidy               # sync go.sum (CI fails if go.sum is stale)
go test ./...             # run all tests (no tests currently exist)
go test ./chat/ -run TestXxx  # run a single test
```

### Release (root)
```bash
npm run release:dry       # dry-run semantic-release (safe preview)
npm run commit            # commitizen interactive prompt (enforced by husky)
```

### Deploy / Ops
```bash
bash deploy.sh                          # full deploy — reads .env.local for OCP credentials
bash cleanup.sh                         # teardown entire namespace
bash scripts/health-check.sh <url>      # validate /health, /ready, WS upgrade
bash scripts/rollback.sh openshift-lab  # oc rollout undo for golang-sample + nginx-sample
node scripts/simulate-chat.js [users] [msgs] [wsUrl]  # load test against live cluster
```

### S2I build trigger (requires oc login)

> ⚠️ **CRITICAL — always commit first, then build from `git archive`.**
> `oc start-build --from-dir` uses `git archive` internally and sends whatever Git HEAD has.
> Uncommitted changes are **silently ignored** — the pod will receive the old file.

```bash
# Step 1 — commit all changes
git add <files> && git commit -m "..."

# Step 2 — generate tar from Git HEAD (guarantees committed content)
git archive HEAD chat-backend --prefix="" -o backend-build.tar
git archive HEAD chat-frontend --prefix="" -o frontend-build.tar

# Step 3 — build from archive (not --from-dir)
oc start-build golang-sample --from-archive=backend-build.tar --follow -n openshift-lab
oc start-build nginx-sample  --from-archive=frontend-build.tar --follow -n openshift-lab

# Step 4 — point Deployment to new image
oc set image deployment/golang-sample \
  golang-sample="image-registry.openshift-image-registry.svc:5000/openshift-lab/golang-sample:latest" \
  -n openshift-lab
oc set image deployment/nginx-sample \
  nginx-sample="image-registry.openshift-image-registry.svc:5000/openshift-lab/nginx-sample:latest" \
  -n openshift-lab
```

> **CI/CD debt:** BuildConfigs now point to `github.ibm.com/robson-neto/openshift-lab` (branch `develop`).
> Full Git-triggered CI requires a `kubernetes.io/basic-auth` Secret with a GitHub IBM PAT bound to the BuildConfig,
> plus a webhook. Until then the manual `git archive` flow above is the correct approach.

## Architecture

```
chat-frontend (nginx-sample) ──WS──► chat-backend (golang-sample) ──► Redis (chat:global PubSub)
                                          │
                              Hub goroutine + per-client goroutines
```

- All inter-replica broadcast is via Redis Pub/Sub channel `chat:global`
- Message history stored in Redis list `chat:history` (LPUSH + LTRIM, newest first; reversed before delivery)
- Online presence in Redis set `chat:online`
- Rate limiting via Redis key `ratelimit:<nickname>` (INCR + EXPIRE 60s, default 10 msg/min)
- WS frames may contain multiple newline-delimited JSON objects (writePump batches pending sends)

## Critical Patterns

### Go backend
- `redis` package is imported with alias `rdb` everywhere: `import rdb "github.com/openshift-lab/chat-backend/redis"`
- `getEnv(key, fallback)` is defined in **both** `main.go` and `chat/hub.go` (intentional duplication across packages)
- A `Client` is NOT added to the online list on connect — only on first message send (`c.active` flag)
- `websocket.Upgrader` has `CheckOrigin: always true` by design (lab environment)
- The `writePump` flushes all pending `c.send` messages into a single WS frame separated by `\n`; the client-side `simulate-chat.js` splits on `\n` to parse

### Frontend
- Three JS files load in order: `websocket.js` → `ui.js` → `app.js`; globals exposed on `window` as `ChatWS` and `ChatUI`
- No module system — all JS is IIFE-wrapped, communicates via `window.*` globals
- WS URL is constructed at connect time from `window.location` (see `websocket.js`)

### OpenShift manifests
- All manifests use namespace `openshift-lab` — hardcoded, not parameterized
- Redis uses `strategy: Recreate` (required by ReadWriteOnce PVC)
- S2I builder images come from the `openshift` namespace ImageStreamTags (`golang:1.18-ubi9`, `nginx:1.24-ubi9`)
- `chat-backend/.s2i/environment` sets `GO_INSTALL_PACKAGE=.` — S2I builds `main.go` at the repo root of `chat-backend/`
- **S2I scripts must use LF line endings** — CI explicitly checks for CRLF and fails the build

### CI/CD
- Commits are linted only on PRs (not on direct push)
- `deploy-staging.yml` triggers on `develop` push; `release.yml` triggers on `main` push with a manual approval gate for production
- Required GitHub secrets: `OPENSHIFT_STAGING_TOKEN`, `OPENSHIFT_STAGING_SERVER`, `OPENSHIFT_PROD_TOKEN`, `OPENSHIFT_PROD_SERVER`, `SLACK_WEBHOOK_URL`

## TechZone Cluster Quirks (itz-1y1puu — Frankfurt fra02)

These are non-obvious issues specific to this TechZone cluster that **will break a fresh deploy** if not handled. `deploy.sh` handles all of them automatically; for manual deploys follow `docs/architecture.md` § "Deploy manual passo a passo".

1. **Registry internal disabled by default** — `managementState: Removed`. Must be activated before any S2I build:
   ```bash
   oc patch configs.imageregistry.operator.openshift.io cluster --type merge \
     --patch-file <(echo '{"spec":{"managementState":"Managed","storage":{"emptyDir":{}},"replicas":1}}')
   oc rollout status deployment/image-registry -n openshift-image-registry --timeout=180s
   ```

2. **S2I Git trigger produces `InvalidOutputReference`** — the build controller does not recognize the registry even after it starts. Use binary builds (see Commands above); never use the Git trigger/ConfigChange trigger.

3. **Deployment image not auto-updated after first build** — the Deployment was created before any build succeeded, so it retains the bare `golang-sample:latest` tag which resolves to Docker Hub (not found). Run `oc set image` with the full internal registry URL after each build.

4. **`REDIS_PORT` env var conflict** — Kubernetes auto-injects `REDIS_PORT=tcp://172.30.x.x:6379` into all pods in the same namespace as the `redis` Service. The Go app concatenates `REDIS_HOST + ":" + REDIS_PORT`, producing an invalid address. The manifest already sets explicit `REDIS_HOST=redis` and `REDIS_PORT=6379` — do not remove them.

## Commit Convention

Enforced by commitlint + husky. Valid scopes: `backend`, `frontend`, `redis`, `manifests`, `ci`, `docs`, `scripts`, `deps`.  
Subject: imperative, lowercase, no trailing period, max 100 chars header.

## Environment

Credentials and cluster URL are in `.env.local` (gitignored). Scripts source this file automatically. Do not commit it.
