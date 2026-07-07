# S004 — Tenant Context Middleware

**Status:** Done  
**Fase:** 0 — Fundação  
**Prioridade:** CRÍTICA  
**Depende de:** S003  
**Data:** 2026-07-04

---

## Problema

Atualmente qualquer cliente pode passar `?appKey=qualquer-coisa` e acessar dados de outro tenant. Não existe verificação de que o usuário autenticado tem permissão sobre o `appKey` solicitado.

## Requisitos

| # | Requisito |
|---|-----------|
| RF01 | Modelo `mAppAccess` associa `userId` ↔ `appKey` com role (`owner`, `editor`, `viewer`) |
| RF02 | Middleware `requireAppAccess(minRole)` extrai `appKey` da query/body e valida via `mAppAccess` |
| RF03 | Admin global (role `admin` no JWT) bypass o check de tenant |
| RF04 | `POST /apps/access` — concede acesso de um user a uma app |
| RF05 | `DELETE /apps/access/:userId/:appKey` — revoga acesso |
| RF06 | `GET /apps/mine` — lista todas as apps acessíveis pelo user logado |
| RF07 | Todos os módulos com `appKey` (products, erp, catalog, mjson) usam o middleware |

## Modelo de Dados — `mAppAccess`

```
uuid       String (UUID v4)
userId     ObjectId → mAuth
appKey     String
role       'owner' | 'editor' | 'viewer'
grantedBy  ObjectId → mAuth
createdAt  Date
```

Índice único: `{ userId, appKey }`

## Middleware

```typescript
// src/middleware/requireAppAccess.ts
export function requireAppAccess(minRole: 'viewer' | 'editor' | 'owner') {
  return async (ctx) => {
    const appKey = ctx.query.appKey || ctx.body?.appKey;
    const userId = ctx.user.sub; // do JWT (S003)
    if (ctx.user.roles.includes('admin')) return; // bypass
    const access = await mAppAccess.findOne({ userId, appKey });
    if (!access || !hasRole(access.role, minRole)) {
      ctx.set.status = 403;
      return { success: false, error: 'Sem acesso a esta aplicação' };
    }
  };
}
```

## Arquivos

- `src/models/mAppAccess.ts`
- `src/middleware/requireAppAccess.ts`
- `src/routes/apps.ts` — novos endpoints de acesso
