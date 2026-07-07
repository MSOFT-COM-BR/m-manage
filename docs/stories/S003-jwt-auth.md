# S003 — JWT Real + Authorization Middleware

**Status:** Done  
**Fase:** 0 — Fundação  
**Prioridade:** CRÍTICA  
**Data:** 2026-07-04

---

## Problema

O sistema atual usa token Base64 simples (`Buffer.from(id:timestamp)`), sem expiração, sem secret, sem verificação em rotas protegidas. Qualquer endpoint retorna dados sem validar se o chamador está autenticado.

## Requisitos

| # | Requisito |
|---|-----------|
| RF01 | JWT assinado com `JWT_SECRET` (HS256), expiração configurável (default 7d) |
| RF02 | Refresh token separado (30d), armazenado em `mAuth.refresh_token` |
| RF03 | Middleware `requireAuth` que valida Bearer token em rotas protegidas |
| RF04 | Middleware `requireRole(...roles)` para RBAC |
| RF05 | `POST /auth/logout` invalida refresh token |
| RF06 | `POST /auth/refresh` troca refresh token por novo access token |
| RF07 | Rotas públicas: `POST /auth/login`, `POST /auth/register`, `GET /` |
| RF08 | Todas as demais rotas exigem Bearer token válido |

## Modelo de Dados — alterações em `mAuth`

```
access_token    → remover (não mais usado)
refresh_token   String (hash do refresh token)
tokenVersion    Number (incrementar no logout para invalidar todos os tokens)
```

## Endpoints novos

| Método | Path | Descrição |
|--------|------|-----------|
| POST | /auth/refresh | Troca refresh token por novo JWT |
| POST | /auth/logout | Invalida refresh token do usuário |
| GET | /auth/me | Retorna usuário logado (requer auth) |

## Payload JWT

```json
{
  "sub": "<userId>",
  "email": "user@example.com",
  "roles": ["admin"],
  "appKey": "bva",
  "iat": 1234567890,
  "exp": 1234567890
}
```

## Variáveis de Ambiente

```
JWT_SECRET=<string forte 64 chars>
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
```

## Dependências

```
bun add jsonwebtoken @types/jsonwebtoken
```

## Arquivos

- `src/config/jwt.ts` — helpers: `signToken()`, `verifyToken()`, `signRefresh()`
- `src/middleware/requireAuth.ts` — middleware ElysiaJS
- `src/middleware/requireRole.ts` — middleware RBAC
- `src/routes/auth.ts` — adicionar `/refresh`, `/logout`, `/me`
- `src/models/mAuth.ts` — adicionar `refresh_token`, `tokenVersion`
