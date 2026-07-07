# S006 — Rate Limiting + API Keys

**Status:** Backlog  
**Fase:** 1 — Governança API  
**Prioridade:** ALTA  
**Depende de:** S003  
**Data:** 2026-07-04

---

## Problema

Nenhum controle de uso da API. Qualquer client pode fazer chamadas ilimitadas, abrindo espaço para abuso, DDoS e custo não controlado.

## Requisitos

| # | Requisito |
|---|-----------|
| RF01 | Rate limiter por IP: 100 req/min (unauthenticated), 1000 req/min (authenticated) |
| RF02 | Rate limiter por API Key: configurável por plano |
| RF03 | Resposta 429 com header `Retry-After` |
| RF04 | Contadores armazenados em Redis (sliding window) |
| RF05 | `POST /api-keys` — gera API key (prefixo `bva_`, hash armazenado) |
| RF06 | `GET /api-keys` — lista keys do user |
| RF07 | `DELETE /api-keys/:id` — revoga key |
| RF08 | API Key aceita em header `X-API-Key` como alternativa ao Bearer JWT |

## Modelo de Dados — `mApiKey`

```
uuid        String (UUID v4)
userId      ObjectId → mAuth
appKey      String (tenant)
prefix      String ('bva_xxxx' — primeiros 8 chars visíveis)
hash        String (SHA-256 do secret completo)
name        String (label do user: 'Production Key')
lastUsedAt  Date
expiresAt   Date (opcional)
rateLimit   Number (req/min, default por plano)
status      'active' | 'revoked'
```

## Redis Keys

```
rate:ip:<ip>:<window>          → contador
rate:user:<userId>:<window>    → contador
rate:key:<keyId>:<window>      → contador
```

## Arquivos

- `src/models/mApiKey.ts`
- `src/middleware/rateLimit.ts`
- `src/middleware/apiKeyAuth.ts`
- `src/modules/api-keys/` — controller + index
