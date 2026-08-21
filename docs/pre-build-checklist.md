# 📋 Pre-Build Checklist — `oc start-build`

> Validar cada item antes de executar `oc start-build --from-dir=./chat-backend`.
> Itens marcados como **[CRÍTICO]** causam falha imediata de build se ignorados.

---

## 1. Dependências Go

| # | Item | Comando de verificação | Esperado | Status atual |
|---|------|------------------------|----------|--------------|
| 1.1 | `go mod tidy` executado | `go mod tidy && echo OK` | `OK` (sem erros) | ✅ |
| 1.2 | `go.sum` presente e não vazio | `Get-Content go.sum \| Measure-Object -Line` | ≥ 1 linha | ✅ 99 linhas |
| 1.3 | `go build ./...` compila sem erros **[CRÍTICO]** | `go build ./...` | Saída vazia (exit 0) | ✅ |
| 1.4 | Dependência usa `go-redis/v8` (não v9) **[CRÍTICO]** | `Select-String "go-redis" go.mod` | `go-redis/redis/v8` | ✅ v8.11.5 |

> ⚠️ **Por que v8?** O `go-redis/v9` causou OOM no builder S2I (node com 4 vCPU / 16 GB).
> `go-redis/v8` tem footprint de compilação significativamente menor.

---

## 2. Scripts S2I **[CRÍTICO]**

| # | Item | Comando de verificação | Esperado | Status atual |
|---|------|------------------------|----------|--------------|
| 2.1 | `assemble` existe | `Test-Path .s2i/bin/assemble` | `True` | ✅ |
| 2.2 | `run` existe | `Test-Path .s2i/bin/run` | `True` | ✅ |
| 2.3 | `assemble` com LF (não CRLF) **[CRÍTICO]** | Ver nota abaixo | Sem byte `0x0D` | ✅ LF |
| 2.4 | `run` com LF (não CRLF) **[CRÍTICO]** | Ver nota abaixo | Sem byte `0x0D` | ✅ LF |
| 2.5 | Shebang `#!/bin/bash` na linha 1 de cada script | `Get-Content .s2i/bin/assemble -TotalCount 1` | `#!/bin/bash` | ✅ |

### Como verificar line endings (PowerShell)

```powershell
# Para cada script S2I:
$bytes = [System.IO.File]::ReadAllBytes(".s2i\bin\assemble")
if ($bytes -contains 13) { "CRLF - CORRIGIR" } else { "LF - OK" }
```

### Como corrigir CRLF → LF (se necessário)

```powershell
# Opção 1 — via PowerShell
$content = Get-Content ".s2i\bin\assemble" -Raw
$content = $content -replace "`r`n", "`n"
[System.IO.File]::WriteAllText((Resolve-Path ".s2i\bin\assemble"), $content)

# Opção 2 — via VSCode
# Abrir arquivo → clicar em "CRLF" no rodapé direito → selecionar "LF" → salvar

# Opção 3 — via .gitattributes (previne reincidência)
# Adicionar ao .gitattributes:
# .s2i/bin/* text eol=lf
```

> ⚠️ **Por que LF?** O bash dentro do builder UBI9 rejeita scripts com CRLF com erro:
> `/usr/bin/bash^M: bad interpreter` — o `^M` é o `\r` do CRLF sendo interpretado como parte do caminho.

---

## 3. Estrutura de Arquivos **[CRÍTICO]**

| # | Item | Comando de verificação | Esperado | Status atual |
|---|------|------------------------|----------|--------------|
| 3.1 | `main.go` na raiz do diretório de build | `Test-Path main.go` | `True` | ✅ |
| 3.2 | `go.mod` na raiz do diretório de build | `Test-Path go.mod` | `True` | ✅ |
| 3.3 | `go.sum` na raiz do diretório de build | `Test-Path go.sum` | `True` | ✅ |
| 3.4 | Module path correto no `go.mod` | `Select-String "^module" go.mod` | `github.com/openshift-lab/chat-backend` | ✅ |
| 3.5 | Porta `8080` exposta no código | `Select-String "8080" main.go` | Match encontrado | ✅ `PORT=8080` |
| 3.6 | `.s2i/environment` presente | `Test-Path .s2i/environment` | `True` | ✅ |

---

## 4. Variáveis de Ambiente no Deployment

Verificar após o build que o Deployment `golang-sample` tem todas as env vars:

```powershell
$env:KUBECONFIG = "openshift-lab\conf_kubeconfig_download.conf"
oc get deployment golang-sample -n openshift-lab `
  -o jsonpath='{.spec.template.spec.containers[0].env}' | ConvertFrom-Json | Format-Table name, value
```

| Variável | Valor esperado | Crítico? |
|----------|---------------|---------|
| `REDIS_HOST` | `redis` | ✅ Sim |
| `REDIS_PORT` | `6379` | ✅ Sim |
| `REDIS_PASSWORD` | `<do Secret redis-secret>` | ✅ Sim |
| `HISTORY_LIMIT` | `100` | Não |
| `RATE_LIMIT` | `10` | Não |
| `GIN_MODE` | `release` | Não |
| `PORT` | `8080` | ✅ Sim |

> ⚠️ **Por que REDIS_HOST e REDIS_PORT precisam ser explícitos?**
> O Kubernetes injeta automaticamente a variável `REDIS_PORT=tcp://172.30.x.x:6379`
> para todos os pods no mesmo namespace quando existe um Service chamado `redis`.
> O app Go lê `REDIS_HOST + ":" + REDIS_PORT`, então sem as env vars explícitas
> o endereço fica `redis:tcp://172.30.x.x:6379` — inválido. O manifest já inclui
> essas variáveis; não as remova.

---

## 5. Comando de Build

```powershell
# Sempre usar --from-dir (envia o diretório local, não clona do Git)
# ⚠️  NUNCA usar trigger Git neste cluster — gera InvalidOutputReference
#     enquanto o registry interno não está ativo/reconhecido pelo build controller.
$env:KUBECONFIG = "openshift-lab\conf_kubeconfig_download.conf"
oc start-build golang-sample `
  --from-dir=chat-backend `
  --follow `
  -n openshift-lab
```

> ⚠️ `--follow` exibe os logs em tempo real e retorna exit 0/1 ao final.
> Sem `--follow`, o build roda em background — verificar com `oc get builds -n openshift-lab`.

### Após o build: atualizar imagem no Deployment

```powershell
# ⚠️  OBRIGATÓRIO após cada build neste cluster.
# O Deployment não detecta automaticamente a nova imagem no ImageStream
# porque foi criado antes do primeiro build bem-sucedido.
oc set image deployment/golang-sample `
  golang-sample="image-registry.openshift-image-registry.svc:5000/openshift-lab/golang-sample:latest" `
  -n openshift-lab
oc set image deployment/nginx-sample `
  nginx-sample="image-registry.openshift-image-registry.svc:5000/openshift-lab/nginx-sample:latest" `
  -n openshift-lab
```

---

## 6. Validação Pós-Build

```powershell
# 1. Pod em Running
oc get pods -n openshift-lab -l app=golang-sample

# 2. Health check
$host = oc get route golang-sample -n openshift-lab -o jsonpath='{.spec.host}'
curl -k "https://$host/health"   # esperado: {"status":"ok"}
curl -k "https://$host/ready"    # esperado: {"status":"ready"}

# 3. WebSocket (wscat ou simulate-chat.js)
node openshift-lab\scripts\simulate-chat.js 2 10
```

---

## Referência Rápida — Erros Conhecidos

| Erro no build log | Causa | Solução |
|---|---|---|
| `bad interpreter: No such file or directory` | CRLF nos scripts `.s2i/bin/` | Item 2.3/2.4 — converter para LF |
| `go: github.com/go-redis/redis/v9: OOM killed` | `go-redis/v9` muito pesado | Item 1.4 — usar `v8` |
| `verifying module: checksum mismatch` | `go.sum` desatualizado | `go mod tidy` + recomitar `go.sum` |
| `cannot find package` | `go.sum` ausente | `go mod tidy` localmente primeiro |
| `http: 400 Bad Request` no WebSocket | Falta `?nickname=` na URL | Passar nickname como query param |
| `Unexpected server response: 400` | Nickname inválido (< 3 chars ou chars especiais) | Nickname: 3–20 chars, letras/números/`_`/`-` |
| `InvalidOutputReference` no build | Registry interno desabilitado | Ativar registry: `oc patch configs.imageregistry... --type merge --patch-file registry-patch.json` |
| `redis:tcp://...: too many colons` no app | `REDIS_PORT` injetado pelo K8s sobrescrevendo o fallback | Env vars `REDIS_HOST` e `REDIS_PORT` devem ser explícitas no Deployment |
| Pod em `ImagePullBackOff` após build | Deployment aponta para `golang-sample:latest` (Docker Hub) | Executar `oc set image` com URL completa do registry interno |
