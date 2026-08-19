# OpenShift Lab — Arquitetura, Sizing e Guias

> Documento técnico completo: diagrama lógico, estimativa de recursos,
> ordem de implantação, CI/CD, checklists de validação e limpeza.

---

## Diagrama Lógico da Arquitetura

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    IBM TechZone — OCP 4.18 (Medium)                      │
│                   <BASTION_HOST>       │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                 Namespace: openshift-lab                            │ │
│  │                                                                     │ │
│  │  ┌──────────────────────────────────────────────────────────────┐  │ │
│  │  │                  Ingress / Router (HAProxy)                   │  │ │
│  │  │        *.apps.itz-qi8nl6.infra01-lb.fra02.techzone.ibm.com   │  │ │
│  │  └────────────┬───────────────┬──────────────┬───────────────────┘  │ │
│  │               │ Route (HTTPS) │ Route (HTTPS) │ Route (HTTPS)        │ │
│  │               ▼               ▼               ▼                      │ │
│  │  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐           │ │
│  │  │  (.NET Core 8) │ │   (Go 1.21)    │ │  (Nginx 1.24)  │           │ │
│  │  │  Port: 8080    │ │  Port: 8080    │ │  Port: 8080    │           │ │
│  │  │  S2I Build     │ │  S2I Build     │ │  S2I Build     │           │ │
│  │  │  1 replica     │ │  1 replica     │ │  1 replica     │           │ │
│  │  └────────┬───────┘ └────────────────┘ └────────────────┘           │ │
│  │           │ ClusterIP (6379)                                         │ │
│  │           ▼                                                          │ │
│  │  ┌────────────────┐                                                  │ │
│  │  │     Redis 7    │  ← ClusterIP only (sem Route externa)            │ │
│  │  │  Port: 6379    │                                                  │ │
│  │  │  PVC: 1Gi      │                                                  │ │
│  │  └────────────────┘                                                  │ │
│  │                                                                      │ │
│  │  ┌──────────────────────────────────────────────────────────────┐   │ │
│  │  │                   OpenShift Internal Registry                │   │ │
│  │  │   ImageStream: golang-sample | nginx-sample  │   │ │
│  │  └──────────────────────────────────────────────────────────────┘   │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │             S2I Build Pipeline (nativa OCP)                         │ │
│  │                                                                     │ │
│  │  GitHub Repo ──► BuildConfig ──► Build Pod ──► ImageStream ──►      │ │
│  │  (git clone)     (S2I strategy)  (compila)    (imagem salva)        │ │
│  │                                                   │                 │ │
│  │                                                   ▼                 │ │
│  │                                             Deployment              │ │
│  │                                          (trigger automático)       │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘

Acesso externo via browser:
  https://golang-sample-openshift-lab.apps.itz-qi8nl6.infra01-lb.fra02.techzone.ibm.com
  https://nginx-sample-openshift-lab.apps.itz-qi8nl6.infra01-lb.fra02.techzone.ibm.com
```

---

## Estimativa de Recursos por Componente

### Em execução steady-state (após builds)

| Componente | CPU Request | CPU Limit | Mem Request | Mem Limit | Storage |
|------------|-------------|-----------|-------------|-----------|---------|
| golang-sample | 25m | 100m | 64 Mi | 128 Mi | — |
| nginx-sample | 25m | 100m | 32 Mi | 64 Mi | — |
| redis | 50m | 200m | 64 Mi | 128 Mi | 1 Gi PVC |
| **Total steady** | **100m** | **400m** | **160 Mi** | **320 Mi** | **1 Gi** |

### Durante o período de build S2I (pico temporário)

| BuildConfig | CPU (build) | Mem (build) | Duração estimada |
|-------------|-------------|-------------|-----------------|
| golang-sample | 100–500m | 256–512 Mi | ~1–2 min |
| nginx-sample | 50–300m | 128–256 Mi | ~1–2 min |

> Os builds rodam em sequência ou paralelo dependendo da disponibilidade de nós.
> Após os builds, os pods de build são terminados e os recursos são liberados.

---

## Sizing Mínimo para Cluster TechZone

| Perfil | vCPU | RAM | Adequado? | Observação |
|--------|------|-----|-----------|------------|
| **Small** (1 worker) | 2 vCPU | 8 GB | ⚠️ Marginal | Apenas com outros namespaces vazios |
| **Medium** (2 workers) | 4 vCPU | 16 GB | ✅ Recomendado | Suficiente para o lab completo |
| **Large** (3+ workers) | 8+ vCPU | 32+ GB | ✅ Ideal | Com folga para outros projetos |

> O cluster atual no TechZone é **Medium (4 vCPU / 16 GB RAM)** — adequado para este lab.
> O lab consome apenas ~150m CPU e ~288 Mi RAM em steady-state — impacto mínimo no cluster.

---

## Estratégia de Build: Source-to-Image (S2I)

### Por que S2I?

| Critério | S2I | Dockerfile | Vantagem S2I |
|---------|-----|------------|-------------|
| Segurança | Non-root nativo | Requer cuidado | ✅ |
| Suporte Red Hat | Imagens UBI certificadas | Variável | ✅ |
| Complexidade | Zero config | Precisa Dockerfile | ✅ |
| Rebuild automático | Trigger via ImageStream | Manual | ✅ |
| Compatibilidade OCP | Nativa | Requer BuildConfig extra | ✅ |

### Fluxo S2I

```
1. BuildConfig detecta mudança (trigger: ConfigChange ou WebHook)
2. Build Pod é criado com a imagem builder (ex: golang:1.21-ubi9)
3. Build Pod clona o repositório Git
4. S2I executa: assemble script (compila o código)
5. Imagem resultante é pushed para o ImageStream interno
6. Deployment detecta nova tag no ImageStream → rolling update automático
```

---

## Estrutura Git Recomendada

```
openshift-lab/                     ← este diretório
├── README.md
├── deploy.sh                      ← deploy completo em 1 comando
├── cleanup.sh                     ← remoção limpa
├── manifests/
│   ├── 00-project.yaml            ← Namespace
│   ├── 02-golang-sample.yaml      ← IS + BC + Deploy + Svc + Route
│   ├── 03-nginx-sample.yaml       ← IS + BC + Deploy + Svc + Route
│   └── 04-redis.yaml              ← PVC + Secret + Deploy + Svc
└── docs/
    └── architecture.md            ← este arquivo
```

### Estratégia de branches

```
main          ← produção / estado final validado
└── dev       ← desenvolvimento / experimentos
    └── feature/xxx ← features pontuais
```

---

## Estratégia CI/CD

### Opção A — S2I Nativo (recomendado para TechZone/lab)

```
GitHub Push ──► OCP WebHook ──► BuildConfig ──► Build ──► ImageStream ──► Deployment
```

**Vantagens:** zero infraestrutura extra, nativo OCP, sem Tekton nem ArgoCD.

**Como configurar o webhook:**
```bash
# Obter URL do webhook do BuildConfig

# No GitHub: Settings → Webhooks → Add webhook
# Payload URL: <URL do webhook acima>
# Content-Type: application/json
```

---

### Opção B — Tekton Pipelines (opcional, apenas se necessário)

**Quando usar:** quando precisar de etapas customizadas (testes, scan de segurança, multi-ambiente).

**Quando NÃO usar:** este lab simples não justifica a sobrecarga do Tekton (~500m CPU / 512 Mi RAM adicionais).

**Decisão para este lab: ❌ Não usar Tekton** — S2I nativo é suficiente.

---

### Opção C — ArgoCD / OpenShift GitOps (opcional, apenas se necessário)

**Quando usar:** quando precisar de GitOps declarativo, multi-cluster, reconciliação contínua.

**Quando NÃO usar:** para um lab temporário de 3 dias com um único namespace, ArgoCD adiciona complexidade desnecessária (~500m CPU / 512 Mi RAM adicionais).

**Decisão para este lab: ❌ Não usar ArgoCD** — `oc apply -f manifests/` é suficiente.

---

## Justificativa: Redis vs MongoDB vs PostgreSQL

| Banco | RAM idle | CPU idle | Storage mín. | Setup | Suporte Red Hat |
|-------|----------|----------|--------------|-------|----------------|
| **Redis 7** | 32–64 Mi | ~10m | 1 Gi | Simples | ✅ UBI9 |
| MongoDB Community | 200–400 Mi | ~50m | 2 Gi | Médio | ⚠️ Community only |
| PostgreSQL | 100–200 Mi | ~20m | 1 Gi | Médio | ✅ UBI9 |

**Escolha: Redis** — menor footprint, imagem certificada Red Hat (`rhel9/redis-7`), ideal para cache e persistência simples em ambiente de lab.

---

## Namespaces / Organização de Projetos

| Namespace | Conteúdo | Política |
|-----------|---------|---------|
| `openshift-lab` | Todas as aplicações + Redis | Lab isolado, fácil de deletar |
| `openshift` | ImageStreams builder (golang, nginx) | Compartilhado, n�o modificar |

> Usar um único namespace `openshift-lab` simplifica o cleanup (`oc delete namespace openshift-lab`).

---

## Ordem de Implantação

```
1. oc login          ← autenticar no cluster
2. 00-project.yaml   ← criar namespace
3. 04-redis.yaml     ← banco de dados primeiro (dependência das apps)
4. 03-nginx-sample   ← build mais rápido (~1 min)
5. 02-golang-sample  ← build médio (~2 min)
7. Validação         ← oc get pods + routes
```

> Nginx e Golang podem ser aplicados em paralelo.

---

## Passo a Passo de Implantação Manual

### 1. Login no cluster OCP

```bash
# Via bastion (SSH)
ssh -i ~/.ssh/<CLUSTER>.pem -p 10022 itzuser@<BASTION_HOST>

# Dentro do bastion — login OCP
oc login <OCP_SERVER> \
  -u kubeadmin -p <OCP_PASSWORD> \
  --insecure-skip-tls-verify
```

### 2. Verificar ImageStreams builders disponíveis

```bash
# Confirmar que os builders S2I existem no namespace openshift
oc get imagestreams -n openshift | grep -E "golang|nginx"

# Listar tags disponíveis
oc get imagestreamtags -n openshift | grep -E "golang|nginx"
```

> Se os builders não existirem, instale via oc import-image:
> ```bash
> oc import-image golang:1.21-ubi9 --from=registry.access.redhat.com/ubi9/go-toolset \
>   -n openshift --confirm
> oc import-image nginx:1.24-ubi9 --from=registry.access.redhat.com/ubi9/nginx-124 \
>   -n openshift --confirm
> ```

### 3. Deploy via script (recomendado)

```bash
# Clonar ou copiar o projeto para o bastion
scp -i ~/.ssh/<CLUSTER>.pem -P 10022 -r ./openshift-lab \
  itzuser@<BASTION_HOST>:~/

# Executar deploy
bash ~/openshift-lab/deploy.sh
```

### 4. Deploy manual passo a passo (alternativo)

```bash
# Namespace
oc apply -f openshift-lab/manifests/00-project.yaml
oc project openshift-lab

# Redis
oc apply -f openshift-lab/manifests/04-redis.yaml
oc rollout status deployment/redis -n openshift-lab

# Apps S2I
oc apply -f openshift-lab/manifests/03-nginx-sample.yaml
oc apply -f openshift-lab/manifests/02-golang-sample.yaml
```

### 5. Monitorar builds

```bash
# Listar builds em andamento
oc get builds -n openshift-lab -w

# Ver logs de um build específico

# Ver log do build mais recente
```

### 6. Verificar deployment

```bash
# Status dos pods
oc get pods -n openshift-lab

# Obter URLs das aplicações
oc get routes -n openshift-lab

# Teste rápido de conectividade
curl -k https://$(oc get route nginx-sample -n openshift-lab -o jsonpath='{.spec.host}')
curl -k https://$(oc get route golang-sample -n openshift-lab -o jsonpath='{.spec.host}')

# Testar Redis (de dentro do cluster via rsh)
oc rsh deployment/redis -n openshift-lab
redis-cli -a <REDIS_PASSWORD> ping   # esperado: PONG
```

---

## Checklist de Validação Após Deploy

### Infraestrutura

- [ ] `oc get nodes` → todos os nodes em `Ready`
- [ ] `oc get namespace openshift-lab` → `Active`
- [ ] `oc get pvc -n openshift-lab` → PVC `redis-data` em `Bound`

### Builds S2I

- [ ] `oc get builds -n openshift-lab` → todos em `Complete`
- [ ] `oc get imagestream -n openshift-lab` → 3 ImageStreams com tag `latest`
- [ ] Nenhum build em `Failed` ou `Error`

### Pods

- [ ] `oc get pods -n openshift-lab` → todos em `Running`
- [ ] `oc get pods -n openshift-lab` → Redis com `1/1 Running`
- [ ] `oc get pods -n openshift-lab` → golang-sample com `1/1 Running`
- [ ] `oc get pods -n openshift-lab` → nginx-sample com `1/1 Running`

### Routes e Acesso

- [ ] `oc get routes -n openshift-lab` → 3 routes com host gerado
- [ ] `curl -k https://<nginx-route>` → responde HTTP 200
- [ ] `curl -k https://<golang-route>` → responde HTTP 200

### Redis

- [ ] `oc rsh deployment/redis` + `redis-cli -a <REDIS_PASSWORD> ping` → `PONG`

---

## Checklist de Limpeza do Ambiente

### Opção rápida (recomendada)

```bash
# Remove tudo de uma vez (namespace + todos os recursos dentro)
oc delete namespace openshift-lab
```

### Opção via script

```bash
bash openshift-lab/cleanup.sh
```

### Verificação pós-cleanup

- [ ] `oc get namespace openshift-lab` → `NotFound`
- [ ] `oc get pvc --all-namespaces | grep openshift-lab` → vazio
- [ ] `oc get routes --all-namespaces | grep openshift-lab` → vazio
- [ ] `oc get imagestreams -n openshift-lab` → `NotFound`

---

## Riscos e Limitações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Builders S2I não disponíveis no namespace `openshift` | Build falha | Importar manualmente via `oc import-image` |
| Cluster Medium sem CPU livre suficiente durante builds | Builds ficam Pending | Aplicar um build por vez; aguardar conclusão antes do próximo |
| PVC não provisionado (sem default StorageClass) | Redis fica Pending | Verificar `oc get sc`; especificar `storageClassName` explicitamente |
| Reserva TechZone expira em 3 dias | Perda do ambiente | Executar cleanup antes da expiração; exportar logs se necessário |
| Redis sem TLS | Dados em plain text no cluster | Aceitável para lab; em produção usar Redis TLS ou Secrets encriptados |
| Token OCP expira | `oc` para de funcionar | Fazer novo `oc login` |

---

## Referências

| Recurso | URL |
|---------|-----|
| Golang S2I | https://github.com/sclorg/golang-ex |
| Nginx S2I | https://github.com/sclorg/nginx-ex |
| Redis UBI9 (Red Hat) | https://catalog.redhat.com/software/containers/rhel9/redis-7 |
| S2I Docs | https://docs.openshift.com/container-platform/4.18/cicd/builds/build-strategies.html |
| OCP BuildConfig | https://docs.openshift.com/container-platform/4.18/cicd/builds/understanding-buildconfigs.html |
| OCP ImageStream | https://docs.openshift.com/container-platform/4.18/openshift_images/image-streams-manage.html |
| Cluster TechZone | https://techzone.ibm.com/my/requests/6a83048f9a24e6763ac1b8e7 |
| OCP Console | https://console-openshift-console.apps.itz-qi8nl6.infra01-lb.fra02.techzone.ibm.com |
