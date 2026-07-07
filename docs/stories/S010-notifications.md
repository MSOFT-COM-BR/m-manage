# S010 — Notifications Module

**Status:** Backlog  
**Fase:** 2 — Integrações  
**Prioridade:** MÉDIA  
**Depende de:** S003  
**Data:** 2026-07-04

---

## Problema

Não há forma de enviar notificações para usuários das apps clientes (email, WhatsApp, push). Cada app precisaria ter sua própria infra.

## Requisitos

| # | Requisito |
|---|-----------|
| RF01 | `POST /notifications/email` — envia email via SMTP ou Resend |
| RF02 | `POST /notifications/whatsapp` — envia mensagem via Evolution API / Z-API |
| RF03 | `GET /notifications?appKey=x` — histórico de notificações enviadas |
| RF04 | Templates por tipo (`welcome`, `reset_password`, `lead_received`, `order_confirmed`) |
| RF05 | `mNotification` persiste cada envio com status e canal |
| RF06 | Retry automático em falha (3x) |
| RF07 | Throttle por destinatário (máximo 10 emails/hora por endereço) |

## Modelo de Dados — `mNotification`

```
uuid        String
appKey      String
to          String (email ou telefone)
channel     'email' | 'whatsapp' | 'sms' | 'push'
template    String
subject     String
body        String
status      'sent' | 'failed' | 'pending'
attempts    Number
error       String
sentAt      Date
```

## Variáveis de Ambiente

```
RESEND_API_KEY=re_xxx
SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS
ZAPI_INSTANCE=xxx
ZAPI_TOKEN=xxx
EVOLUTION_URL=https://api.evolution.com
EVOLUTION_KEY=xxx
```

## Arquivos

- `src/models/mNotification.ts`
- `src/services/email.service.ts`
- `src/services/whatsapp.service.ts`
- `src/modules/notifications/` — controller + index
