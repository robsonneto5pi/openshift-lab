# OpenShift Lab — Sample Applications Demo

> Subprojeto independente para validação de deploys em Red Hat OpenShift via IBM TechZone.
> Recursos mínimos, implantação rápida, remoção limpa.

---

## Estrutura do Projeto

```
openshift-lab/
├── README.md                        ← Este arquivo
├── deploy.sh                        ← Deploy completo em um comando
├── cleanup.sh                       ← Remoção limpa de todos os recursos
├── manifests/
│   ├── 00-project.yaml              ← Namespace / Project OpenShift
│   ├── 01-dotnet-sample.yaml        ← .NET Core S2I App
│   ├── 02-golang-sample.yaml        ← Golang S2I App
│   ├── 03-nginx-sample.yaml         ← Nginx S2I App
│   └── 04-redis.yaml                ← Redis (persistência simples)
└── docs/
    └── architecture.md              ← Diagrama, tabelas, checklists
```

---

## Aplicações

| App | Tecnologia | Estratégia | Porta |
|-----|-----------|------------|-------|
| dotnet-sample | .NET Core 8 | S2I + BuildConfig | 8080 |
| golang-sample | Go 1.21 | S2I + BuildConfig | 8080 |
| nginx-sample | Nginx 1.24 | S2I + BuildConfig | 8080 |
| redis | Redis 7 | Deployment direto | 6379 |

---

## Deploy Rápido

```bash
# 1. Conectar ao cluster OCP (via bastion ou local)
oc login https://api.itz-qi8nl6.infra01-lb.fra02.techzone.ibm.com:6443 \
  -u kubeadmin -p NjG2T-7uWMm-8xGbM-9hupn --insecure-skip-tls-verify

# 2. Executar deploy completo
bash openshift-lab/deploy.sh

# 3. Acompanhar builds
oc get builds -n openshift-lab -w

# 4. Verificar pods
oc get pods -n openshift-lab

# 5. Obter URLs das aplicações
oc get routes -n openshift-lab
```

---

## Remoção Completa

```bash
bash openshift-lab/cleanup.sh
```

---

## Referências

- [.NET Core S2I](https://github.com/redhat-developer/s2i-dotnetcore-ex)
- [Golang S2I](https://github.com/sclorg/golang-ex)
- [Nginx S2I](https://github.com/sclorg/nginx-ex)
- [Redis on OpenShift](https://catalog.redhat.com/software/containers/rhel9/redis-7/63f94e6d6eb6ded04e2e6aa6)
- [Red Hat Container Catalog](https://catalog.redhat.com)
- Cluster TechZone: `https://api.itz-qi8nl6.infra01-lb.fra02.techzone.ibm.com:6443`
