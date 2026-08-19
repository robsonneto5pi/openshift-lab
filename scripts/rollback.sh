#!/usr/bin/env bash
# =============================================================================
# rollback.sh — Reverte deployments para a revisão anterior OU para uma tag
# Uso: bash scripts/rollback.sh <namespace> [previous_tag]
# Ex:  bash scripts/rollback.sh openshift-lab
#      bash scripts/rollback.sh openshift-lab v1.0.0
# =============================================================================
set -euo pipefail

NAMESPACE="${1:-openshift-lab}"
PREVIOUS_TAG="${2:-}"
APPS=("golang-sample" "nginx-sample")

# Se tag fornecida, tentar obter do git
if [ -z "$PREVIOUS_TAG" ]; then
  PREVIOUS_TAG=$(git describe --tags --abbrev=0 "$(git rev-list --tags --skip=1 -n 1)" 2>/dev/null || echo "")
fi

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*"; }

echo ""
echo "════════════════════════════════════════"
echo "  ROLLBACK — namespace: $NAMESPACE"
echo "  Apps: ${APPS[*]}"
echo "════════════════════════════════════════"
echo ""
warn "Iniciando rollback para revisão anterior..."

EXIT_CODE=0

for app in "${APPS[@]}"; do
  echo ""
  echo "--- Rollback: $app ---"

  # Verificar se deployment existe
  if ! oc get deployment "$app" -n "$NAMESPACE" &>/dev/null; then
    warn "$app não encontrado no namespace $NAMESPACE — pulando"
    continue
  fi

  # Mostrar revisão atual antes do rollback
  current_rev=$(oc rollout history deployment/"$app" -n "$NAMESPACE" 2>/dev/null | tail -2 | head -1 | awk '{print $1}' || echo "?")
  echo "  Revisão atual: $current_rev"

  # Executar rollback
  if oc rollout undo deployment/"$app" -n "$NAMESPACE"; then
    # Aguardar estabilização
    if oc rollout status deployment/"$app" -n "$NAMESPACE" --timeout=90s; then
      ok "$app: rollback concluído"
    else
      err "$app: rollback executado mas pod não estabilizou"
      EXIT_CODE=1
    fi
  else
    err "$app: falha ao executar rollback"
    EXIT_CODE=1
  fi
done

echo ""
echo "════════════════════════════════════════"

if [ $EXIT_CODE -eq 0 ]; then
  ok "Rollback concluído com sucesso — namespace: $NAMESPACE"
else
  err "Rollback com erros — verifique os pods acima"
fi

echo ""
echo "Estado atual dos pods:"
oc get pods -n "$NAMESPACE" -l "app in (golang-sample,nginx-sample)" 2>/dev/null || true

if [ -n "$PREVIOUS_TAG" ]; then
  echo ""
  warn "Tag de referência do rollback: $PREVIOUS_TAG"
fi

echo ""
exit $EXIT_CODE
