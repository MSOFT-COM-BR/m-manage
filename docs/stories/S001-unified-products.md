# S001 — Cadastro Unificado de Produtos

**Status:** Done  
**Módulo:** products  
**Versão:** 1.0.0  
**Data:** 2026-07-04

---

## Contexto

O m-manage precisa de um cadastro de produtos que sirva a múltiplas aplicações (`appKey`) sem duplicar coleções. Cada produto pertence a uma app específica, tem identidade global via UUID v4 e suporta variações, imagens, categorias, tags, estoque e metadados flexíveis.

## Requisitos Funcionais

| # | Requisito |
|---|-----------|
| RF01 | Produto possui `uuid` v4 gerado automaticamente e imutável |
| RF02 | Produto é obrigatoriamente vinculado a uma `appKey` (tenant) |
| RF03 | Combinação `appKey + slug` é única (permite mesmo slug em apps diferentes) |
| RF04 | Produto suporta variações (cor, tamanho, etc.) com estoque próprio |
| RF05 | Produto suporta múltiplas imagens com flag de imagem principal |
| RF06 | Status: `draft`, `active`, `inactive`, `archived` |
| RF07 | Preço com suporte a moeda configurável (default BRL) |
| RF08 | Campos `meta` livres (SEO, integrações externas) |
| RF09 | CRUD completo: list, get by uuid, create, update, delete (soft) |
| RF10 | Listagem com filtro por `appKey`, `category`, `status`, `tag` e paginação |

## Modelo de Dados — `mProduct`

```
uuid          String (UUID v4, único, imutável)
appKey        String (tenant/app dona do produto)
name          String
slug          String (gerado do name se não fornecido)
description   String
shortDesc     String (resumo para listagens)
sku           String (opcional, por app)
price         Number
comparePrice  Number (preço riscado / de)
currency      String (default BRL)
category      String
tags          String[]
status        draft | active | inactive | archived
images        [{ url, alt, isPrimary }]
variants      [{ name, sku, price, stock, attrs }]
stock         Number (estoque total, gerenciado externamente ou por variants)
weight        Number (kg, para frete)
dimensions    { width, height, depth }
meta          Mixed (livre: SEO, IDs externos, etc.)
createdAt     Date
updatedAt     Date
```

## Endpoints

| Método | Path | Descrição |
|--------|------|-----------|
| GET | /products | Lista produtos (query: appKey, category, status, tag, page, limit) |
| GET | /products/:uuid | Busca produto por UUID |
| GET | /products/slug/:appKey/:slug | Busca por appKey + slug |
| POST | /products | Cria produto |
| PUT | /products/:uuid | Atualiza produto |
| DELETE | /products/:uuid | Soft delete (status → archived) |
| DELETE | /products/:uuid/hard | Hard delete (admin) |

## Decisões Técnicas

- UUID gerado com `crypto.randomUUID()` nativo do Bun/Node — zero dependências extras
- Slug auto-gerado via `name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')`
- Soft delete padrão (muda `status` para `archived`); hard delete disponível mas separado
- `strict: false` em `meta` para extensibilidade sem schema fixo
- Índices: `uuid` (unique), `appKey`, `appKey+slug` (unique), `appKey+category`, `appKey+status`

## Exceção BVA

Para `appKey=bva`, `GET /products` é uma projeção pública de `mErp/produto_fabril`, com preço recalculado pelos insumos. `mProduct` continua como cadastro genérico multi-app, mas não é a fonte de verdade da vitrine Studio BVA.

## Arquivos Criados

- `docs/stories/S001-unified-products.md` (este arquivo)
- `src/models/mProduct.ts`
- `src/modules/products/product.controller.ts`
- `src/modules/products/index.ts`
- Registro em `src/app.ts`
