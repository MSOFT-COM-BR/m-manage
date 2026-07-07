# S002 — Integração m-bva ↔ m-manage

**Status:** Done  
**Módulo:** auth + products + erp  
**Versão:** 1.0.0  
**Data:** 2026-07-04

---

## Contexto

O m-bva (Studio BVA Store) era 100% client-side: login falso em localStorage, produtos em JSON estático, ERP em localStorage. Esta story unifica o m-bva com o m-manage como backend centralizado, mantendo a UX existente.

## Escopo

| # | Mudança | Onde |
|---|---------|------|
| C01 | Login real via `POST /auth/login` m-manage | m-bva `portal.html` |
| C02 | Token + user persistido em `sessionStorage` (não mais localStorage hardcoded) | m-bva `portal.html` |
| C03 | Produtos carregados via `GET /products?appKey=bva`, projetados de `mErp/produto_fabril` | m-bva `index.html` |
| C04 | ERP (insumos, produtos fabris, kardex) persistido via `POST /mjson` com `appKey=bva` | m-bva `portal.html` + m-manage |
| C05 | Módulo ERP dedicado no m-manage (`/erp`) com endpoints typed | m-manage |
| C06 | `appKey=bva` como tenant padrão em todos os recursos BVA | m-manage |
| C07 | Seed operacional de produtos BVA via `/erp/produtos`, com precificação por insumo | m-manage |

## Arquitetura

```
m-bva (static frontend)
  ├── portal.html
  │     ├── handleLogin()  →  POST  https://api.m-manage.com/auth/login
  │     ├── ERP insumos    →  GET/POST /erp/insumos?appKey=bva
  │     ├── ERP produtos   →  GET/POST /erp/produtos?appKey=bva
  │     └── ERP kardex     →  GET/POST /erp/kardex?appKey=bva
  └── index.html
        └── loadProducts() →  GET  /products?appKey=bva&status=active

m-manage (Bun + ElysiaJS + MongoDB)
  ├── /auth/login          (já existe — usado sem mudança)
  ├── /products            (público; para appKey=bva projeta mErp/produto_fabril)
  └── /erp                 (novo — S002)
        ├── GET  /erp/insumos?appKey=
        ├── POST /erp/insumos
        ├── PUT  /erp/insumos/:uuid
        ├── GET  /erp/produtos?appKey=
        ├── POST /erp/produtos
        ├── PUT  /erp/produtos/:uuid
        ├── GET  /erp/kardex?appKey=
        └── POST /erp/kardex
```

## Modelo ERP — `mErp`

Uma coleção única com `tipo: 'insumo' | 'produto_fabril' | 'kardex'` e `appKey` como tenant.

```
uuid       String (UUID v4, imutável)
appKey     String (tenant)
tipo       'insumo' | 'produto_fabril' | 'kardex'
data       Mixed (payload livre por tipo)
createdAt  Date
updatedAt  Date
```

## m-bva: Configuração de API

Variável global `BVA_API` em cada HTML aponta para m-manage:
```js
const BVA_API = 'http://localhost:3000'; // dev
// const BVA_API = 'https://api.mirandasoft.com.br'; // prod
```

## Fallback

Sem fallback operacional para JSON local. Se m-manage não responder, a vitrine exibe erro de API/banco indisponível.

## Atualização 2026-07-07 — Catálogo BVA como projeção do ERP

O catálogo público BVA deixou de usar `mProduct` como fonte de verdade. Para `appKey=bva`, `GET /products?appKey=bva` lê diretamente `mErp` com `tipo='produto_fabril'`, recalcula preço com `calcularPrecificacao()` e retorna o formato público esperado pela vitrine. A coleção `mProduct` permanece disponível para produtos genéricos de outras apps, mas não deve receber seed/sync do catálogo 3D BVA.

## Arquivos Modificados

**m-manage:**
- `docs/stories/S002-bva-integration.md` (este arquivo)
- `src/models/mErp.ts` — modelo ERP unificado
- `src/modules/erp/erp.controller.ts` — endpoints ERP
- `src/modules/erp/index.ts` — export
- `src/app.ts` — registro `.use(erpRoutes)`

**m-bva:**
- `portal.html` — login real + ERP via API
- `index.html` — produtos via API com fallback
