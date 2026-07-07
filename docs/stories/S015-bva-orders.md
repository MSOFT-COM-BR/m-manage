# S015 — Persistência de Pedidos BVA (`mBvaOrder`)

**Status:** Done
**Módulo:** bva-orders
**Depende de:** S001, S004
**Data:** 2026-07-05 (retroativa — implementada junto com a integração de checkout do m-bva, nunca documentada)

---

## Contexto

O checkout público do m-bva (`index.html` → `sendCartToWhatsapp()`) precisava registrar o pedido antes de abrir o link `wa.me`, para não depender só da mensagem de WhatsApp como única fonte de verdade da venda.

## Escopo

| # | Endpoint | Auth |
|---|----------|------|
| E01 | `POST /bva/orders` — cria pedido | público (checkout roda sem login) |
| E02 | `GET /bva/orders?appKey=&status=&limit=` — lista pedidos | `requireAppAccess('viewer')` |
| E03 | `PATCH /bva/orders/:id` — atualiza status | `requireAppAccess('editor')` |

## Modelo — `mBvaOrder` (coleção `bva_orders`)

```
code        String (único, formato BVA-YYYYMMDD-XXXXXXXX)
appKey      String
channel     'whatsapp'
status      'new' | 'sent_to_whatsapp' | 'confirmed' | 'delivered' | 'cancelled'
currency    String (BRL)
total       Number
items       [{ productId, sku, name, category, unitPrice, quantity, subtotal }]
customer    { name, phone, email, address, notes }
reseller    { id, name, whatsapp, instagram }
whatsappTarget String
source      String
metadata    Mixed
createdAt/updatedAt
```

Índices: `{ appKey, createdAt: -1 }`, `{ appKey, status, createdAt: -1 }`.

`POST` recalcula o total a partir dos itens (`normalizeItems`) e só aceita o total informado pelo cliente se estiver a ±0.05 do calculado — proteção contra total forjado no front.

## Integração com Portal m-bva

Em 2026-07-07, a S013 do m-bva removeu o bloqueio admin-only da listagem e adicionou atualização de status para o painel do portal. A listagem exige acesso `viewer` no tenant informado por `appKey`; mudança de status exige `editor`.

## Arquivos

- `src/models/mBvaOrder.ts`
- `src/routes/bvaOrders.ts`
- `src/app.ts` — `.use(bvaOrderRoutes)`

## Critério de Aceite

- `POST /bva/orders` sem auth cria pedido com total validado ✅
- `GET /bva/orders` sem token → 401; com token `viewer`/`editor` do app → 200 ✅
- `PATCH /bva/orders/:id` com token `editor` do app atualiza status ✅
