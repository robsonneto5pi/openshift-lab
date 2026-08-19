#!/usr/bin/env bash
# =============================================================================
# OpenShift Lab — Cleanup Completo
# Remove TODOS os recursos do namespace openshift-lab incluindo o namespace.
# Uso: bash openshift-lab/cleanup.sh
# Pré-requisito: oc instalado; credenciais em openshift-lab/.env.local
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAMESPACE="openshift-lab"

# ─── Carregar .env.local ──────────────────────────────────────────────────────
ENV_FILE="${SCRIPT_DIR}/.env.local"
if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  echo "🔐 .env.local carregado"
else
  echo "⚠️  ${ENV_FILE} não encontrado — assumindo que oc login já foi feito."
fi

# ─── Cores ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✅  $*${NC}"; }
warn() { echo -e "${YELLOW}⚠️   $*${NC}"; }

echo ""
echo "════════════════════════════════════════════════════════"
echo "  OpenShift Lab — Cleanup"
echo "  ATENÇÃO: Todos os recursos de '${NAMESPACE}' serão removidos."
echo "════════════════════════════════════════════════════════"
echo ""
read -rp "  Confirma remoção? (s/N): " _CONFIRM
[[ "${_CONFIRM,,}" == "s" ]] || { echo "Cancelado."; exit 0; }

# ─── Verificar pré-requisitos / Login ────────────────────────────────────────
command -v oc &>/dev/null || { echo "❌ oc CLI não encontrado."; exit 1; }

if ! oc whoami &>/dev/null; then
  [[ -z "${OCP_SERVER:-}" || -z "${OCP_PASSWORD:-}" ]] && { echo "❌ Não autenticado e .env.local incompleto."; exit 1; }
  oc login "${OCP_SERVER}" -u "${OCP_USER:-kubeadmin}" -p "${OCP_PASSWORD}" \
    --insecure-skip-tls-verify &>/dev/null \
    || { echo "❌ Falha no login."; exit 1; }
fi

# ─── Verificar se namespace existe ───────────────────────────────────────────
if ! oc get namespace "${NAMESPACE}" &>/dev/null; then
  warn "Namespace '${NAMESPACE}' não encontrado — nada a remover."
  exit 0
fi

# ─── Remover Routes ──────────────────────────────────────────────────────────
echo ""
echo "▶ Removendo Routes..."
oc delete routes --all -n "${NAMESPACE}" --ignore-not-found=true
ok "Routes removidas"

# ─── Remover Services ────────────────────────────────────────────────────────
echo "▶ Removendo Services..."
oc delete services --all -n "${NAMESPACE}" --ignore-not-found=true
ok "Services removidos"

# ─── Remover Deployments ─────────────────────────────────────────────────────
echo "▶ Removendo Deployments..."
oc delete deployments --all -n "${NAMESPACE}" --ignore-not-found=true
ok "Deployments removidos"

# ─── Remover Builds e BuildConfigs ───────────────────────────────────────────
echo "▶ Removendo Builds e BuildConfigs..."
oc delete builds --all -n "${NAMESPACE}" --ignore-not-found=true
oc delete buildconfigs --all -n "${NAMESPACE}" --ignore-not-found=true
ok "Builds e BuildConfigs removidos"

# ─── Remover ImageStreams ─────────────────────────────────────────────────────
echo "▶ Removendo ImageStreams..."
oc delete imagestreams --all -n "${NAMESPACE}" --ignore-not-found=true
ok "ImageStreams removidos"

# ─── Remover PVCs ────────────────────────────────────────────────────────────
echo "▶ Removendo PersistentVolumeClaims..."
oc delete pvc --all -n "${NAMESPACE}" --ignore-not-found=true
ok "PVCs removidos"

# ─── Remover Secrets ─────────────────────────────────────────────────────────
echo "▶ Removendo Secrets do lab..."
oc delete secret redis-secret -n "${NAMESPACE}" --ignore-not-found=true
ok "Secrets removidos"

# ─── Remover Namespace ───────────────────────────────────────────────────────
echo ""
echo "▶ Removendo namespace '${NAMESPACE}'..."
oc delete namespace "${NAMESPACE}" --wait=true
ok "Namespace '${NAMESPACE}' removido com sucesso"

echo ""
echo "════════════════════════════════════════════════════════"
echo "  ✅ Cleanup concluído — nenhum recurso residual."
echo "════════════════════════════════════════════════════════"
