# S011 — Audit Trail + LGPD Compliance

**Status:** Backlog  
**Fase:** 3 — Compliance  
**Prioridade:** MÉDIA  
**Depende de:** S003  
**Data:** 2026-07-04

---

## Problema

Não há registro imutável de quem fez o quê e quando. Sem isso é impossível auditar incidentes ou provar compliance com LGPD.

## Requisitos

| # | Requisito |
|---|-----------|
| RF01 | `mAudit` — coleção append-only com toda escrita (create, update, delete) |
| RF02 | Middleware `auditLog(action)` registra automaticamente em rotas write |
| RF03 | `GET /audit?appKey=x&userId=y&from=&to=` — consulta o trail |
| RF04 | TTL index: 7 anos de retenção |
| RF05 | `DELETE /auth/me` — right to be forgotten: anonimiza PII, mantém estrutura |
| RF06 | `GET /auth/me/export` — exporta todos os dados do user (DSAR) |
| RF07 | PII masking em logs: emails/telefones aparecem como `b***@***.com` |

## Modelo de Dados — `mAudit`

```
uuid       String
appKey     String
userId     ObjectId
action     'create' | 'update' | 'delete' | 'login' | 'logout' | 'export'
resource   String ('product', 'user', 'lead', ...)
resourceId String
before     Mixed (snapshot antes da mudança)
after      Mixed (snapshot após)
ip         String
userAgent  String
createdAt  Date (TTL: 7 anos)
```

## Arquivos

- `src/models/mAudit.ts`
- `src/middleware/auditLog.ts`
- `src/modules/audit/` — controller + index
- `src/routes/auth.ts` — `/me/export`, `DELETE /me`
