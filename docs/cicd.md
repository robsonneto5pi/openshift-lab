# CI/CD — Guia Completo

> Pipeline de CI/CD com **GitHub Actions** + **semantic-release** para o projeto **OpenShift Lab**.

---

## Arquitetura do Pipeline

```
Desenvolvedor
     │
     │  git commit (Conventional Commits)
     │  git push → develop
     ▼
┌─────────────────────────────────────────────────────┐
│  GitHub Actions — CI (ci.yml)                       │
│  ├── commitlint (formato dos commits)               │
│  ├── go build ./... (backend)                       │
│  ├── yamllint (manifests)                           │
│  └── check LF nos scripts S2I                       │
└────────────────────┬────────────────────────────────┘
                     │ CI passa
                     ▼
┌─────────────────────────────────────────────────────┐
│  GitHub Actions — Deploy Staging (deploy-staging.yml)│
│  ├── oc start-build golang-sample --from-dir        │
│  ├── oc start-build nginx-sample --from-dir         │
│  ├── oc rollout status (aguarda pod Running)        │
│  ├── health-check.sh (/health + /ready)             │
│  └── Notificação Slack                              │
└─────────────────────────────────────────────────────┘

     │  PR: develop → main (2 approvals obrigatórios)
     ▼
┌─────────────────────────────────────────────────────┐
│  GitHub Actions — Release (release.yml)             │
│  ├── semantic-release                               │
│  │   ├── Analisa commits desde último tag           │
│  │   ├── Determina nova versão (semver)             │
│  │   ├── Gera CHANGELOG.md                         │
│  │   ├── Cria tag vX.Y.Z no GitHub                 │
│  │   └── Publica GitHub Release                    │
│  │                                                 │
│  └── Deploy Production (aguarda approval manual)   │
│      ├── oc start-build (dos 2 serviços)           │
│      ├── health-check.sh                           │
│      ├── rollback.sh (se falhar)                   │
│      └── Notificação Slack                         │
└─────────────────────────────────────────────────────┘
```

---

## Conventional Commits — Referência Rápida

| Prefixo | Quando usar | Versão gerada |
|---|---|---|
| `feat(scope): ...` | Nova funcionalidade | **MINOR** (1.X.0) |
| `fix(scope): ...` | Correção de bug | **PATCH** (1.0.X) |
| `perf(scope): ...` | Melhoria de performance | **PATCH** |
| `refactor(scope): ...` | Refatoração sem bug/feature | **PATCH** |
| `docs(scope): ...` | Apenas documentação | sem release |
| `chore(scope): ...` | Manutenção, dependências | sem release |
| `ci(scope): ...` | Mudanças no pipeline CI/CD | sem release |
| `BREAKING CHANGE:` | Quebra de compatibilidade | **MAJOR** (X.0.0) |

### Escopos permitidos
`backend` · `frontend` · `redis` · `manifests` · `ci` · `docs` · `scripts` · `deps`

### Exemplos válidos
```
feat(backend): add rate limit logging for observability
fix(frontend): reconnect WebSocket after 401 error
perf(redis): use pipeline for batch history writes
docs(cicd): add branch protection instructions
chore(deps): upgrade go-redis from v8.11.5 to v8.11.6

# Breaking change:
feat(backend)!: change WebSocket URL from /ws to /api/v1/ws

BREAKING CHANGE: clients must update WebSocket endpoint URL
```

---

## Branches e Proteção

| Branch | Papel | Quem pode fazer push | Approvals para PR |
|---|---|---|---|
| `main` | Produção — sempre deployável | Ninguém diretamente | **2 approvals** |
| `develop` | Staging — integração contínua | Committers | **1 approval** |
| `feature/*` | Features em desenvolvimento | Autor | 0 (PR para develop) |
| `fix/*` | Bug fixes | Autor | 0 (PR para develop) |
| `release/X.Y.Z` | Release candidate | Autor | 1 (PR para main) |
| `hotfix/*` | Correção urgente em produção | Autor | 1 (PR direta para main) |

### Configurar branch protection no GitHub

```
Repository → Settings → Branches → Add rule

Branch: main
  ✅ Require a pull request before merging
  ✅ Require approvals: 2
  ✅ Dismiss stale pull request approvals when new commits are pushed
  ✅ Require status checks to pass before merging
     → build-backend
     → validate-manifests
     → check-s2i-scripts
  ✅ Require branches to be up to date before merging
  ✅ Include administrators

Branch: develop
  ✅ Require a pull request before merging
  ✅ Require approvals: 1
  ✅ Require status checks to pass before merging
     → build-backend
```

---

## GitHub Secrets — Configuração

```
Repository → Settings → Secrets and variables → Actions → New repository secret
```

| Secret | Valor | Como obter |
|---|---|---|
| `OPENSHIFT_STAGING_TOKEN` | Token de SA do cluster staging | Ver abaixo |
| `OPENSHIFT_STAGING_SERVER` | `https://api.itz-70730t.hub04-lb.techzone.ibm.com:6443` | `.env.local` → `OCP_SERVER` |
| `OPENSHIFT_PROD_TOKEN` | Token de SA do cluster produção | Ver abaixo |
| `OPENSHIFT_PROD_SERVER` | URL do cluster produção | `.env.local` produção |
| `SLACK_WEBHOOK_URL` | `https://hooks.slack.com/services/...` | Slack App → Incoming Webhooks |

### Criar Service Account Token para CI

```bash
# Criar SA dedicada ao CI (não usar kubeadmin em produção)
oc create serviceaccount github-ci -n openshift-lab

# Dar permissão para builds e deployments
oc adm policy add-role-to-user edit \
  system:serviceaccount:openshift-lab:github-ci \
  -n openshift-lab

# Obter o token (OCP 4.x — token de longa duração)
oc create token github-ci -n openshift-lab --duration=8760h
# → copiar o token para o secret OPENSHIFT_STAGING_TOKEN
```

---

## GitHub Environments — Approval Gate para Production

```
Repository → Settings → Environments → New environment

Name: production
  ✅ Required reviewers: [adicionar 2 revisores]
  ✅ Prevent self-review
  Wait timer: 0 (opcional: 5min para dar tempo de cancelar)
  Deployment branches: Selected branches → main

Name: staging
  (sem reviewers — deploy automático)
  Deployment branches: Selected branches → develop
```

---

## Instalar Dependências Locais

```powershell
# Na raiz do projeto openshift-lab/
cd openshift-lab

# Instalar todas as dependências de CI/CD
npm install

# Ativar Husky (hooks de commit)
npm run prepare

# Testar semantic-release sem publicar
npm run release:dry

# Fazer commit usando commitizen (modo interativo)
npm run commit
```

---

## Fluxo de Trabalho Diário

```bash
# 1. Criar branch de feature a partir de develop
git checkout develop
git pull
git checkout -b feature/add-rate-limit-logging

# 2. Fazer mudanças no código
# ... editar openshift-lab/chat-backend/chat/hub.go ...

# 3. Commit com formato correto (usando commitizen)
git add .
npm run commit
# → selecionar: fix(backend): add logging for rate limit rejections

# 4. Push e abrir PR para develop
git push origin feature/add-rate-limit-logging
# → Abrir PR no GitHub → develop

# 5. CI roda automaticamente (ci.yml)
# → commitlint ✅ go build ✅ yamllint ✅

# 6. Após 1 approval → merge para develop
# → deploy-staging.yml dispara automaticamente
# → Slack notifica sucesso/falha

# 7. Quando pronto para release → PR develop → main
# → Precisa 2 approvals
# → Após merge: release.yml gera tag vX.Y.Z
# → Approval gate de production
# → Deploy production + Slack
```

---

## Arquivos do Pipeline

| Arquivo | Função |
|---|---|
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | Lint, build Go, validação YAML, check S2I |
| [`.github/workflows/deploy-staging.yml`](../.github/workflows/deploy-staging.yml) | Deploy automático em push para develop |
| [`.github/workflows/release.yml`](../.github/workflows/release.yml) | Semantic release + deploy production com gate |
| [`.releaserc.json`](../.releaserc.json) | Configuração semantic-release (regras, plugins) |
| [`.commitlintrc.json`](../.commitlintrc.json) | Regras de validação de commits |
| [`package.json`](../package.json) | Dependências e scripts npm |
| [`scripts/health-check.sh`](../scripts/health-check.sh) | Validação pós-deploy (`/health` + `/ready`) |
| [`scripts/rollback.sh`](../scripts/rollback.sh) | Rollback automático em caso de falha |
| [`.husky/commit-msg`](../.husky/commit-msg) | Hook: valida formato do commit |
| [`.husky/pre-commit`](../.husky/pre-commit) | Hook: verifica LF nos scripts S2I |
