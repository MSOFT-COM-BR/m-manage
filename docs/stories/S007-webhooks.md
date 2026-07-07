# S007 — Webhooks System

**Status:** Backlog  
**Fase:** 1 — Governança API  
**Prioridade:** ALTA  
**Depende de:** S003, S004  
**Data:** 2026-07-04

---

## Problema

Aplicações client (m-bva, outros) precisam reagir em tempo real a eventos do m-manage (produto criado, lead recebido, usuário registrado). Atualmente precisam fazer polling.

## Eventos suportados

```
user.created       user.updated       user.deleted
app.installed      app.uninstalled
product.created    product.updated    product.archived
lead.created       lead.updated
erp.fabricacao     erp.venda          erp.reposicao
auth.login         auth.failed_login
```

## Requisitos

| # | Requisito |
|---|-----------|
| RF01 | `mWebhook` armazena URL destino + eventos subscritos por appKey |
| RF02 | `POST /webhooks` — registra endpoint |
| RF03 | `GET /webhooks` — lista webhooks da app |
| RF04 | `DELETE /webhooks/:id` — remove webhook |
| RF05 | Entrega via `fetch` com timeout 10s, retry 3x (1s, 5s, 30s) |
| RF06 | Payload assinado com HMAC-SHA256 (`X-Webhook-Signature`) |
| RF07 | `mWebhookLog` — log de cada tentativa (status, response, latência) |
| RF08 | `GET /webhooks/:id/logs` — histórico de entregas |
| RF09 | `POST /webhooks/:id/retry` — reprocessa última entrega falha |

## Modelo de Dados — `mWebhook`

```
uuid      String
appKey    String
url       String
events    String[] (lista de eventos)
secret    String (para HMAC)
status    'active' | 'paused' | 'failed'
failCount Number
lastError String
```

## Modelo de Dados — `mWebhookLog`

```
webhookId  ObjectId → mWebhook
event      String
payload    Mixed
status     'delivered' | 'failed' | 'pending'
attempt    Number
httpStatus Number
response   String
latencyMs  Number
createdAt  Date
```

## Serviço de entrega

```typescript
// src/services/webhook.service.ts
export async function emitWebhookEvent(appKey: string, event: string, payload: any) {
  const hooks = await mWebhook.find({ appKey, events: event, status: 'active' });
  for (const hook of hooks) {
    deliverWithRetry(hook, event, payload); // fire-and-forget
  }
}
```

## Arquivos

- `src/models/mWebhook.ts`
- `src/models/mWebhookLog.ts`
- `src/services/webhook.service.ts`
- `src/modules/webhooks/` — controller + index
