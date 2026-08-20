# 🔗 TechZone Reservation Info

| Campo | Valor |
|-------|-------|
| **Cluster Name** | OpenShift Cluster OCPv IBM Cloud |
| **Environment ID** | `itz-1y1puu` |
| **Reservation ID** | `6a86d03bbd35986274e9828f` |
| **Status** | ✅ Ready |
| **OCP Version** | 4.19 |
| **Region** | Frankfurt (fra02) |

---

## 🔑 Credenciais

**Localização:** `.env.local` (não versionar!)

```bash
# Preencher com dados do e-mail TechZone:
OCP_SERVER=https://api.itz-1y1puu.infra01-lb.fra02.techzone.ibm.com:6443
OCP_USER=kubeadmin
OCP_PASSWORD=<ver .env.local>
```

**Bastion SSH:**
```bash
ssh itzuser@api.itz-1y1puu.infra01-lb.fra02.techzone.ibm.com -p 10022
# Password: <ver .env.local → BASTION_PASSWORD>
```

**OCP Console:**
```
https://console-openshift-console.apps.itz-1y1puu.infra01-lb.fra02.techzone.ibm.com
```

**Kubeconfig:**
```
conf_kubeconfig_download.conf
```

---

## 🗑️ Desprovisionamento

**Comando:**
```bash
oc delete namespace openshift-lab --wait=true
```

**Via:** TZ Agent (na página do TechZone)

---

## ⏰ Prazo

Decida antes da expiração:
- [ ] Manter (renovar se necessário)
- [ ] Cancelar (liberar recursos)

---

*Atualizado: 2026-08-20*
