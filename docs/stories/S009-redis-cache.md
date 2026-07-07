# S009 — Redis Cache Layer

**Status:** Backlog  
**Fase:** 2 — Performance  
**Prioridade:** MÉDIA  
**Data:** 2026-07-04

---

## Problema

Redis está configurado mas nunca usado. Queries repetidas batem direto no MongoDB desnecessariamente.

## Estratégia de cache

| Recurso | TTL | Invalidação |
|---------|-----|-------------|
| `GET /products?appKey=x` | 15 min | product.created/updated/archived |
| `GET /catalog` | 1h | catalog seed |
| `GET /auth/me` | 5 min | user.updated |
| `GET /apps?userId=x` | 10 min | app.installed/uninstalled |
| Rate limiter counters | sliding window | — |

## Requisitos

| # | Requisito |
|---|-----------|
| RF01 | `cache.getOrSet(key, ttl, fn)` — helper que lê cache ou executa query e guarda |
| RF02 | `cache.invalidate(pattern)` — invalida por padrão (ex: `products:bva:*`) |
| RF03 | Aplicar cache em `GET /products`, `GET /catalog`, `GET /auth/me` |
| RF04 | Cache key inclui todos os filtros da query |
| RF05 | Cache degradação graciosa — se Redis cair, vai direto ao MongoDB |

## Implementação

```typescript
// src/config/redis.ts — adicionar helper
export const cache = {
  async getOrSet<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    try {
      const cached = await redis.get(key);
      if (cached) return JSON.parse(cached);
      const result = await fn();
      await redis.set(key, JSON.stringify(result), 'EX', ttlSeconds);
      return result;
    } catch {
      return fn(); // fallback direto ao DB
    }
  },
  async invalidatePattern(pattern: string) {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length) await redis.del(...keys);
    } catch {}
  }
};
```

## Arquivos

- `src/config/redis.ts` — adicionar `getOrSet`, `invalidatePattern`
- `src/modules/products/product.controller.ts` — aplicar cache no GET
- `src/routes/catalog.ts` — aplicar cache
- `src/routes/auth.ts` — cache de `/me`
