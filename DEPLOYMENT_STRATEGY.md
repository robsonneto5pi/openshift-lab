# 🚀 Deployment Strategy - openshift-lab

## Status Atual

- ✅ Repositório criado: `github.ibm.com/robson-neto/openshift-lab`
- ✅ Branches: main + develop com branch protection
- ✅ Código validado (Go build, YAML, scripts)
- ❌ GitHub Actions bloqueado pelo Enterprise IBM

## 🎯 Estratégia de CI/CD

### Opção 1: OpenShift Pipelines (Tekton) - **RECOMENDADO**

**Por quê:**
- ✅ Nativo do OpenShift (pré-instalado em clusters OCP 4.x+)
- ✅ Não depende de recursos externos
- ✅ Integrado com OpenShift (deploy direto em pods)
- ✅ Sem bloqueios Enterprise
- ✅ Melhor para cloud-native Kubernetes

**Como usar:**
1. Quando solicitar novo cluster TechZone, especificar:
   ```
   "I need an OpenShift cluster with Tekton Pipelines operator pre-installed"
   ```

2. AskTZ provisiona com `openshift-pipelines` operator ativo

3. Criar `tekton/` com PipelineRuns:
   ```
   tekton/
   ├── pipeline.yaml           (build + test + deploy)
   ├── pipelinerun-staging.yaml
   ├── pipelinerun-production.yaml
   └── tasks/
       ├── git-clone.yaml
       ├── build.yaml
       ├── test.yaml
       └── deploy.yaml
   ```

4. Trigger via webhook: `github.com webhook → Tekton Trigger → Pipeline`

### Opção 2: GitHub Actions + GitHub.com

**Se migrar para github.com público:**
- Usar `BOB_IMPLEMENTATION_GUIDE.md` conforme planejado
- 100% funcional (sem bloqueios Enterprise)
- Mas requer manutenção separada do OpenShift

## 📅 Recomendação Prática

| Fase | Ação | Timing |
|---|---|---|
| **Agora** | Manter como está | ✅ Repo pronto, validado |
| **Futuro: Novo Cluster** | Solicitar Tekton Pipelines pré-instalado | Próxima reserva TechZone |
| **Depois** | Implementar Tekton Pipelines nativo | Quando cluster estiver pronto |

## 🔧 Template Tekton Pipeline (Para o Futuro)

```yaml
# tekton/pipeline.yaml
apiVersion: tekton.dev/v1beta1
kind: Pipeline
metadata:
  name: openshift-lab-pipeline
spec:
  params:
    - name: git-url
    - name: git-revision
      default: develop
  tasks:
    - name: git-clone
      taskRef:
        name: git-clone
    
    - name: build-backend
      taskRef:
        name: golang
      params:
        - name: context
          value: chat-backend
    
    - name: deploy-staging
      runAfter: [build-backend]
      taskRef:
        name: openshift-deploy
      params:
        - name: namespace
          value: staging-lab
        - name: app-name
          value: openshift-lab
```

## 💡 Por que Tekton > GitHub Actions aqui

| Aspecto | GitHub Actions | Tekton |
|---|---|---|
| Local | Cloud (microsoft.com) | On-cluster (seu OpenShift) |
| Bloqueio Enterprise | ❌ SIM | ✅ NÃO |
| Integração OpenShift | ⚠️ API externa | ✅ Nativa (CRDs) |
| Container Registry | Externo (ghcr.io) | Interno (OpenShift registry) |
| Custo | Dependente de minutos | Grátis (usa pods cluster) |
| Logs | GitHub UI | Kubernetes (kubectl logs) |

## 📞 Próximos Passos

1. **Agora:** Deixar repo como está (validado, pronto)
2. **Quando solicitar cluster:** Dizer ao AskTZ:
   ```
   "OpenShift cluster v4.12+ with Tekton Pipelines operator pre-installed"
   ```
3. **Quando cluster estiver pronto:** Migrar este guia para `TEKTON_PIPELINES.md`

---

**Decisão:** ✅ Manter estratégia agnóstica por enquanto. Quando novo cluster, use Tekton (nativo, sem bloqueios).
