#!/usr/bin/env bash
# =============================================================================
# OpenShift Lab — Deploy Completo
# Uso: bash openshift-lab/deploy.sh
# Pré-requisito: oc instalado; credenciais em openshift-lab/.env.local
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFESTS_DIR="${SCRIPT_DIR}/manifests"
NAMESPACE="openshift-lab"

# ─── Carregar .env.local ──────────────────────────────────────────────────────
ENV_FILE="${SCRIPT_DIR}/.env.local"
if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  echo "🔐 .env.local carregado: ${ENV_FILE}"
else
  echo "⚠️  Arquivo ${ENV_FILE} não encontrado."
  echo "   Crie-o com os dados do e-mail TechZone antes de continuar."
  exit 1
fi

OCP_SERVER="${OCP_SERVER:-}"

# ─── Cores ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✅  $*${NC}"; }
warn() { echo -e "${YELLOW}⚠️   $*${NC}"; }
err()  { echo -e "${RED}❌  $*${NC}"; exit 1; }

echo ""
echo "════════════════════════════════════════════════════════"
echo "  OpenShift Lab — Deploy"
echo "  Namespace : ${NAMESPACE}"
echo "  Servidor  : ${OCP_SERVER}"
echo "════════════════════════════════════════════════════════"
echo ""

# ─── Verificar pré-requisitos ─────────────────────────────────────────────────
command -v oc &>/dev/null || err "oc CLI não encontrado. Instale: https://mirror.openshift.com/pub/openshift-v4/clients/ocp/stable/"

[[ -z "${OCP_SERVER}" ]] && err "OCP_SERVER não definido. Preencha openshift-lab/.env.local"
[[ -z "${OCP_PASSWORD}" ]] && err "OCP_PASSWORD não definido. Preencha openshift-lab/.env.local"

# Login automático com credenciais do .env.local
echo "🔑 Fazendo login no cluster OCP..."
oc login "${OCP_SERVER}" -u "${OCP_USER:-kubeadmin}" -p "${OCP_PASSWORD}" \
  --insecure-skip-tls-verify &>/dev/null \
  && ok "Login OK — usuário: $(oc whoami)" \
  || err "Falha no login. Verifique OCP_SERVER e OCP_PASSWORD em .env.local"

# ─── Step 1: Namespace ───────────────────────────────────────────────────────
echo ""
echo "▶ [1/5] Criando namespace ${NAMESPACE}..."
oc apply -f "${MANIFESTS_DIR}/00-project.yaml"
oc project "${NAMESPACE}"
ok "Namespace ${NAMESPACE} pronto"

# ─── Step 2: Redis ───────────────────────────────────────────────────────────
echo ""
echo "▶ [2/5] Criando Redis (banco de dados)..."
oc apply -f "${MANIFESTS_DIR}/04-redis.yaml"
ok "Redis aplicado"

# ─── Step 3: Aplicações S2I ──────────────────────────────────────────────────
echo ""
echo "▶ [3/5] Criando builds S2I — Nginx, Golang, .NET..."
oc apply -f "${MANIFESTS_DIR}/03-nginx-sample.yaml"
oc apply -f "${MANIFESTS_DIR}/02-golang-sample.yaml"
oc apply -f "${MANIFESTS_DIR}/01-dotnet-sample.yaml"
ok "Manifestos aplicados — builds iniciados automaticamente"

# ─── Step 4: Aguardar Redis ficar Ready ──────────────────────────────────────
echo ""
echo "▶ [4/5] Aguardando Redis ficar Running (máx 3 min)..."
oc rollout status deployment/redis -n "${NAMESPACE}" --timeout=180s && ok "Redis Running" \
  || warn "Redis ainda não está pronto — verifique: oc get pods -n ${NAMESPACE}"

# ─── Step 5: Status ──────────────────────────────────────────────────────────
echo ""
echo "▶ [5/5] Status atual dos builds e pods..."
echo ""
echo "  --- Builds ---"
oc get builds -n "${NAMESPACE}" 2>/dev/null || warn "Nenhum build ainda (aguarde alguns segundos)"
echo ""
echo "  --- Pods ---"
oc get pods -n "${NAMESPACE}"
echo ""
echo "  --- Routes ---"
oc get routes -n "${NAMESPACE}" 2>/dev/null || warn "Routes ainda não disponíveis — aguarde os builds"

echo ""
echo "════════════════════════════════════════════════════════"
echo "  ✅ Deploy concluído!"
echo ""
echo "  Acompanhe os builds:"
echo "    oc get builds -n ${NAMESPACE} -w"
echo ""
echo "  Quando builds concluídos, obtenha as URLs:"
echo "    oc get routes -n ${NAMESPACE}"
echo ""
echo "  Para remover tudo:"
echo "    bash openshift-lab/cleanup.sh"
echo "════════════════════════════════════════════════════════"
