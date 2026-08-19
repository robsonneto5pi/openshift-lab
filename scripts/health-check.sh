#!/usr/bin/env bash
# =============================================================================
# health-check.sh — Valida que o backend está saudável após deploy
# Uso: bash scripts/health-check.sh <base_url>
# Ex:  bash scripts/health-check.sh https://golang-sample-openshift-lab.apps...
# =============================================================================
set -euo pipefail

BASE_URL="${1:-https://golang-sample-openshift-lab.apps.itz-70730t.hub04-lb.techzone.ibm.com}"
MAX_RETRIES=12
RETRY_INTERVAL=10

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }
warn() { echo -e "${YELLOW}[WAIT]${NC} $*"; }

echo ""
echo "════════════════════════════════════════"
echo "  Health Check — OpenShift Lab Backend"
echo "  URL: $BASE_URL"
echo "════════════════════════════════════════"

# ---------------------------------------------------------------------------
# Função: aguardar endpoint responder 200 com retry
# ---------------------------------------------------------------------------
wait_for() {
  local url="$1"
  local name="$2"
  local attempt=1

  while [ $attempt -le $MAX_RETRIES ]; do
    status=$(curl -sk -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    if [ "$status" = "200" ]; then
      ok "$name → HTTP $status"
      return 0
    fi
    warn "$name → HTTP $status (tentativa $attempt/$MAX_RETRIES) aguardando ${RETRY_INTERVAL}s..."
    sleep $RETRY_INTERVAL
    attempt=$((attempt + 1))
  done

  fail "$name → não respondeu 200 após $MAX_RETRIES tentativas (URL: $url)"
}

# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------
wait_for "${BASE_URL}/health" "/health"
wait_for "${BASE_URL}/ready"  "/ready"

# Verificar conteúdo da resposta /health
health_body=$(curl -sk "${BASE_URL}/health" 2>/dev/null)
if echo "$health_body" | grep -q '"status"'; then
  ok "/health body contém 'status': $health_body"
else
  fail "/health body inesperado: $health_body"
fi

# Verificar conteúdo da resposta /ready
ready_body=$(curl -sk "${BASE_URL}/ready" 2>/dev/null)
if echo "$ready_body" | grep -q '"status"'; then
  ok "/ready body contém 'status': $ready_body"
else
  fail "/ready body inesperado: $ready_body"
fi

# Verificar upgrade WebSocket (teste de conectividade — não fatal)
echo ""
echo "--- Verificando WebSocket upgrade ---"
WS_URL="${BASE_URL/https/wss}/ws"
if timeout 8 curl -sk -i -N \
    -H "Connection: Upgrade" \
    -H "Upgrade: websocket" \
    -H "Sec-WebSocket-Version: 13" \
    -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
    "$WS_URL" 2>/dev/null | grep -q "101\|Upgrade"; then
  ok "WebSocket upgrade → 101 Switching Protocols"
else
  warn "WebSocket check inconclusivo (sem nickname — esperado 400 ou timeout)"
fi

echo ""
ok "Todos os health checks passaram — deploy saudável!"
echo ""
