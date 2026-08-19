# 📋 Bob - Tarefa: Implementar GitHub Strategy

## 🎯 Objetivo

Implementar CI/CD automático + semantic versioning para o projeto **openshift-lab** usando `BOB_IMPLEMENTATION_GUIDE.md`.

## 📍 Localização

- **Repositório:** `C:\Users\RobsondeOliveiraNeto\Projetos\IBM\WatsonBIL4\openshift-lab`
- **Template:** `C:\Users\RobsondeOliveiraNeto\Projetos\BOB_IMPLEMENTATION_GUIDE.md`

## 🔧 Customizações para Este Projeto

### Placeholders (Find & Replace)

| Placeholder | Valor para openshift-lab |
|---|---|
| `{{PROJECT_NAME}}` | OpenShift Lab |
| `{{APP_NAME}}` | openshift-lab |
| `{{STAGING_URL}}` | https://staging-lab.apps.cluster.com |
| `{{PRODUCTION_URL}}` | https://lab.apps.cluster.com |
| `{{STAGING_NAMESPACE}}` | staging-lab |
| `{{PRODUCTION_NAMESPACE}}` | production-lab |
| `{{DOCKER_REGISTRY}}` | quay.io (ou seu registry IBM) |
| `{{GCP_PROJECT}}` | seu-projeto-ibm-cloud |
| `{{RUNTIME}}` | node:20 (verify em chat-frontend/package.json) |

## 📦 Estrutura do Projeto

```
openshift-lab/
├── chat-backend/          ← Node.js backend
├── chat-frontend/         ← Frontend web
├── docs/                  ← Documentação
├── manifests/             ← OpenShift YAML manifests
├── scripts/               ← Deploy scripts
├── .env.local             ← Configurações locais
├── deploy.sh              ← Script deploy atual
├── cleanup.sh             ← Script limpeza
├── README.md              ← Guia projeto
└── [NOVO] .github/workflows/    ← Adicionar aqui
    ├── release.yml
    ├── deploy-staging.yml
    └── deploy-production.yml
```

## ✅ Checklist de Implementação

- [ ] **Phase 1:** Copy `.github/workflows/*.yml` do BOB_IMPLEMENTATION_GUIDE.md
- [ ] **Phase 2:** Criar GitHub Secrets (OpenShift tokens, Docker registry, Slack)
- [ ] **Phase 2:** Configurar branch protection (main: 2, develop: 1)
- [ ] **Phase 3:** Instalar dependências (`npm install --save-dev semantic-release ...`)
- [ ] **Phase 4:** Testar com `npm run release -- --dry-run`
- [ ] **Phase 5:** Criar release branch `release/1.0.0` de develop
- [ ] **Phase 5:** Abrir PR para main (precisa 2 approvals)
- [ ] **Phase 5:** Merge dispara semantic-release automaticamente
- [ ] **Validar:** Tag v1.0.0 criada no GitHub
- [ ] **Validar:** Staging deploy automático em develop push
- [ ] **Validar:** Production deploy aguarda approval em tag

## 🔐 GitHub Secrets Necessários

```
OPENSHIFT_STAGING_TOKEN      = [seu-token-staging]
OPENSHIFT_STAGING_SERVER     = https://api.staging-lab.cluster:6443
OPENSHIFT_PROD_TOKEN         = [seu-token-prod]
OPENSHIFT_PROD_SERVER        = https://api.prod-lab.cluster:6443
GCP_PROJECT                  = seu-projeto-ibm-cloud
SLACK_WEBHOOK_URL            = https://hooks.slack.com/services/YOUR/WEBHOOK
NPM_TOKEN                    = [se publicar em npm]
```

## 🚀 Passos Rápidos

```bash
# 1. Abrir BOB_IMPLEMENTATION_GUIDE.md
cd C:\Users\RobsondeOliveiraNeto\Projetos
# Copiar conteúdo de BOB_IMPLEMENTATION_GUIDE.md

# 2. Navegar ao projeto
cd C:\Users\RobsondeOliveiraNeto\Projetos\IBM\WatsonBIL4\openshift-lab

# 3. Criar diretórios
mkdir -p .github/workflows
mkdir -p scripts

# 4. Copy workflows customizados (replace {{PLACEHOLDERS}} acima)
# Salvar os 3 arquivos YAML em .github/workflows/

# 5. Copy scripts
# Salvar health-check.sh e rollback.sh em scripts/

# 6. Copy configs
# Salvar .releaserc.json e .commitlintrc.json na raiz

# 7. Install dependencies (fase 3 do BOB guide)
npm install --save-dev semantic-release @semantic-release/* commitlint husky

# 8. Validate
npm run release -- --dry-run

# 9. GitHub Setup
# - Add secrets (Phase 2)
# - Branch protection: main (2 approvals), develop (1)
# - Create environment "production" com 2-reviewer approval
```

## 📖 Documentação Completa

Para detalhes completos de cada fase, veja:
**`C:\Users\RobsondeOliveiraNeto\Projetos\BOB_IMPLEMENTATION_GUIDE.md`**

---

## 📝 Notas Adicionais

- **Backend:** chat-backend/ (Node.js) - verify `package.json` para scripts
- **Frontend:** chat-frontend/ (Node.js) - verify `package.json` para scripts
- **OpenShift:** Manifests em `manifests/` - workflows automaticamente aplicam com `oc apply -k`
- **Slack:** Notificações em cada deploy (sucesso/falha)
- **Health Checks:** Scripts validam `/health`, `/api/v1/status`, `/api/v1/ready`, `/ws/chat`

## ❓ Se Pedir Ajuda

Diga: "Estou implementando GitHub Strategy para openshift-lab. Estou na Phase X. Problema: [descrever]"

---

**Pronto para começar? 🚀**
