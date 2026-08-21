# 📊 Status do Cluster OpenShift — 2026-08-20

## 🎯 Cluster

| Campo | Valor |
|-------|-------|
| **Environment** | `itz-1y1puu` |
| **OCP Version** | 4.19 |
| **Region** | Frankfurt (fra02) |
| **API** | `https://api.itz-1y1puu.infra01-lb.fra02.techzone.ibm.com:6443` |
| **Console** | https://console-openshift-console.apps.itz-1y1puu.infra01-lb.fra02.techzone.ibm.com |
| **Status** | ✅ Ready — novo cluster provisionado |

---

## 🚀 Deploy Pendente

O namespace `openshift-lab` ainda **não foi criado** neste cluster.

Execute para provisionar tudo do zero:

```bash
source .env.local
bash deploy.sh
```

Isso irá:
1. Criar namespace `openshift-lab`
2. Aplicar Redis (Deployment + PVC + Secret)
3. Aplicar BuildConfigs S2I (golang-sample + nginx-sample)
4. Aguardar Redis ficar Ready
5. Exibir status dos builds e pods

---

## 🌐 URLs Esperadas Após Deploy

| App | URL |
|-----|-----|
| **Chat Frontend** (Nginx) | `https://nginx-sample-openshift-lab.apps.itz-1y1puu.infra01-lb.fra02.techzone.ibm.com` |
| **Chat Backend** (Go) | `https://golang-sample-openshift-lab.apps.itz-1y1puu.infra01-lb.fra02.techzone.ibm.com` |
| **Health** | `https://golang-sample-openshift-lab.apps.itz-1y1puu.infra01-lb.fra02.techzone.ibm.com/health` |
| **Ready** | `https://golang-sample-openshift-lab.apps.itz-1y1puu.infra01-lb.fra02.techzone.ibm.com/ready` |

---

*Atualizado: 2026-08-20*
