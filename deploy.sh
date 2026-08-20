#!/usr/bin/env bash
# =============================================================================
# OpenShift Lab — Deploy Completo
# Uso: bash openshift-lab/deploy.sh
# Pré-requisito: oc instalado; credenciais em openshift-lab/.env.local
#
# ⚠️  ATENÇÃO — Quirks deste cluster TechZone (fra02):
#   1. O registry interno vem desabilitado (managementState=Removed).
#      Este script ativa o registry com emptyDir antes de buildar.
#   2. Os builds S2I devem usar --from-dir (source local), NÃO Git trigger.
#      O trigger ConfigChange gera InvalidOutputReference enquanto o registry
#      não está pronto — novos builds manuais via --from-dir funcionam.
#   3. Após o build, o Deployment precisa da imagem com prefixo do registry
#      interno. O script faz o oc set image automaticamente.
#   4. O Deployment usa env vars explícitas para REDIS_HOST/REDIS_PORT porque
#      o Kubernetes injeta REDIS_PORT=tcp://... que sobrescreve o fallback do app.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFESTS_DIR="${SCRIPT_DIR}/manifests"
NAMESPACE="openshift-lab"
REGISTRY="image-registry.openshift-image-registry.svc:5000"

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
echo "▶ [1/6] Criando namespace ${NAMESPACE}..."
oc apply -f "${MANIFESTS_DIR}/00-project.yaml"
oc project "${NAMESPACE}"
ok "Namespace ${NAMESPACE} pronto"

# ─── Step 2: Ativar registry interno ─────────────────────────────────────────
echo ""
echo "▶ [2/6] Verificando registry interno do cluster..."
REGISTRY_STATE=$(oc get configs.imageregistry.operator.openshift.io cluster \
  -o jsonpath='{.spec.managementState}' 2>/dev/null || echo "Unknown")

if [[ "${REGISTRY_STATE}" == "Removed" ]]; then
  warn "Registry interno está desabilitado (Removed). Ativando com emptyDir..."
  cat <<'EOF' | oc apply -f -
{"apiVersion":"imageregistry.operator.openshift.io/v1","kind":"Config","metadata":{"name":"cluster"},"spec":{"managementState":"Managed","storage":{"emptyDir":{}},"replicas":1,"defaultRoute":true}}
EOF
  echo "  Aguardando registry ficar disponível (máx 3 min)..."
  oc rollout status deployment/image-registry -n openshift-image-registry --timeout=180s \
    && ok "Registry interno ativo" \
    || err "Registry não ficou pronto — verifique: oc get pods -n openshift-image-registry"
else
  ok "Registry interno já ativo (${REGISTRY_STATE})"
fi

# ─── Step 3: Redis ───────────────────────────────────────────────────────────
echo ""
echo "▶ [3/6] Criando Redis (banco de dados)..."
oc apply -f "${MANIFESTS_DIR}/04-redis.yaml"
ok "Redis aplicado"

# ─── Step 4: Manifestos S2I (ImageStream + BuildConfig + Deployment) ─────────
echo ""
echo "▶ [4/6] Aplicando manifestos — Nginx e Golang..."
oc apply -f "${MANIFESTS_DIR}/03-nginx-sample.yaml"
oc apply -f "${MANIFESTS_DIR}/02-golang-sample.yaml"
ok "Manifestos aplicados"

# ─── Step 5: Aguardar Redis + disparar builds ─────────────────────────────────
echo ""
echo "▶ [5/6] Aguardando Redis ficar Running (máx 3 min)..."
oc rollout status deployment/redis -n "${NAMESPACE}" --timeout=180s \
  && ok "Redis Running" \
  || warn "Redis ainda não está pronto — verifique: oc get pods -n ${NAMESPACE}"

echo ""
echo "  Iniciando builds S2I via --from-dir (source local)..."
echo "  (Isso evita InvalidOutputReference que ocorre com o trigger Git neste cluster)"
echo ""

# Cancelar qualquer build pendente antes de iniciar novos
oc cancel-build -l buildconfig=golang-sample -n "${NAMESPACE}" 2>/dev/null || true
oc cancel-build -l buildconfig=nginx-sample  -n "${NAMESPACE}" 2>/dev/null || true

echo "  → Build: golang-sample (chat-backend/)"
oc start-build golang-sample \
  --from-dir="${SCRIPT_DIR}/chat-backend" \
  -n "${NAMESPACE}" &
GOLANG_BUILD_PID=$!

echo "  → Build: nginx-sample (chat-frontend/)"
oc start-build nginx-sample \
  --from-dir="${SCRIPT_DIR}/chat-frontend" \
  -n "${NAMESPACE}" &
NGINX_BUILD_PID=$!

wait $GOLANG_BUILD_PID || true
wait $NGINX_BUILD_PID  || true

echo ""
echo "  Aguardando builds concluírem (máx 10 min)..."
ELAPSED=0; MAX_WAIT=600
while [[ $ELAPSED -lt $MAX_WAIT ]]; do
  sleep 20; ELAPSED=$((ELAPSED + 20))
  GOLANG_STATUS=$(oc get builds -n "${NAMESPACE}" \
    --sort-by='.metadata.creationTimestamp' \
    -l buildconfig=golang-sample --no-headers 2>/dev/null \
    | tail -1 | awk '{print $4}')
  NGINX_STATUS=$(oc get builds -n "${NAMESPACE}" \
    --sort-by='.metadata.creationTimestamp' \
    -l buildconfig=nginx-sample --no-headers 2>/dev/null \
    | tail -1 | awk '{print $4}')
  echo "  [${ELAPSED}s] golang-sample: ${GOLANG_STATUS:-?} | nginx-sample: ${NGINX_STATUS:-?}"
  if [[ "${GOLANG_STATUS}" == "Complete" && "${NGINX_STATUS}" == "Complete" ]]; then
    ok "Ambos os builds concluídos"
    break
  fi
  if [[ "${GOLANG_STATUS}" == "Failed" || "${NGINX_STATUS}" == "Failed" ]]; then
    err "Build falhou — verifique: oc get builds -n ${NAMESPACE}"
  fi
done

# ─── Step 6: Apontar Deployments para imagens do registry interno ─────────────
echo ""
echo "▶ [6/6] Atualizando Deployments com imagens do registry interno..."

GOLANG_IMG="${REGISTRY}/${NAMESPACE}/golang-sample:latest"
NGINX_IMG="${REGISTRY}/${NAMESPACE}/nginx-sample:latest"

oc set image deployment/golang-sample golang-sample="${GOLANG_IMG}" -n "${NAMESPACE}"
oc set image deployment/nginx-sample  nginx-sample="${NGINX_IMG}"  -n "${NAMESPACE}"

echo "  Aguardando rollouts..."
oc rollout status deployment/golang-sample -n "${NAMESPACE}" --timeout=120s \
  && ok "golang-sample Running" \
  || warn "golang-sample ainda não está pronto"

oc rollout status deployment/nginx-sample -n "${NAMESPACE}" --timeout=120s \
  && ok "nginx-sample Running" \
  || warn "nginx-sample ainda não está pronto"

# ─── Status final ─────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════"
echo "  ✅ Deploy concluído!"
echo ""
echo "  --- Pods ---"
oc get pods -n "${NAMESPACE}"
echo ""
echo "  --- Routes ---"
oc get routes -n "${NAMESPACE}"
echo ""
BACKEND_HOST=$(oc get route golang-sample -n "${NAMESPACE}" -o jsonpath='{.spec.host}' 2>/dev/null || echo "")
FRONTEND_HOST=$(oc get route nginx-sample -n "${NAMESPACE}" -o jsonpath='{.spec.host}' 2>/dev/null || echo "")
[[ -n "${BACKEND_HOST}" ]]  && echo "  🔌 Backend  : https://${BACKEND_HOST}"
[[ -n "${FRONTEND_HOST}" ]] && echo "  🌐 Frontend : https://${FRONTEND_HOST}"
echo ""
echo "  Para remover tudo:"
echo "    bash openshift-lab/cleanup.sh"
echo "════════════════════════════════════════════════════════"
