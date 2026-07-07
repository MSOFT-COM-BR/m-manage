# S008 — Billing & Plans

**Status:** Backlog  
**Fase:** 2 — Monetização  
**Prioridade:** MÉDIA-ALTA  
**Depende de:** S003, S006  
**Data:** 2026-07-04

---

## Problema

Sem controle de planos, qualquer app usa recursos ilimitados. Não há como monetizar nem controlar uso.

## Planos

| Plano | Apps | Produtos | Leads/mês | API calls/mês | Webhooks | Preço |
|-------|------|----------|-----------|---------------|----------|-------|
| free | 1 | 20 | 100 | 10.000 | 0 | R$ 0 |
| starter | 3 | 200 | 1.000 | 100.000 | 3 | R$ 49/mês |
| pro | 10 | ilimitado | 10.000 | 1.000.000 | 10 | R$ 149/mês |
| enterprise | ilimitado | ilimitado | ilimitado | ilimitado | ilimitado | sob consulta |

## Requisitos

| # | Requisito |
|---|-----------|
| RF01 | `mPlan` define limites por plano |
| RF02 | `mSubscription` associa user a plano (status, período, Stripe ID) |
| RF03 | `mUsage` acumula uso mensal por user/appKey (API calls, storage, leads) |
| RF04 | Middleware `checkQuota(resource)` bloqueia quando limite atingido (402) |
| RF05 | `GET /billing/plan` — plano atual + uso do mês |
| RF06 | `POST /billing/upgrade` — inicia checkout Stripe |
| RF07 | `POST /billing/webhook` — recebe eventos Stripe (payment, cancel, renew) |
| RF08 | `GET /billing/invoices` — histórico de faturas |

## Modelo de Dados — `mSubscription`

```
uuid          String
userId        ObjectId
plan          'free' | 'starter' | 'pro' | 'enterprise'
status        'active' | 'past_due' | 'cancelled' | 'trialing'
stripeSubId   String
currentPeriodStart Date
currentPeriodEnd   Date
cancelAtPeriodEnd  Boolean
```

## Modelo de Dados — `mUsage`

```
userId    ObjectId
appKey    String
month     String (YYYY-MM)
apiCalls  Number
products  Number
leads     Number
storageKb Number
```

## Arquivos

- `src/models/mPlan.ts`
- `src/models/mSubscription.ts`
- `src/models/mUsage.ts`
- `src/middleware/checkQuota.ts`
- `src/services/stripe.service.ts`
- `src/modules/billing/` — controller + index
