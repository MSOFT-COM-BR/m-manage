# Tech Stack — m-manage

## Runtime & Framework
- **Bun** 1.3.5+ — runtime TypeScript nativo, ultra-rápido
- **ElysiaJS** 1.4+ — framework web type-safe com validação embutida
- **TypeScript** 5.x — tipagem estrita (`strict: true`)

## Banco de Dados
- **MongoDB** 7.0 — banco principal via Mongoose 8.x
- **Redis** — cache opcional (graceful degradation se indisponível)
- **Cassandra** — backup distribuído (opcional, fire-and-forget)

## Padrão de Módulos
```
src/
  modules/<nome>/
    index.ts              # export público
    <nome>.controller.ts  # Elysia routes
  models/
    m<Nome>.ts            # Mongoose model + interface
  routes/
    <nome>.ts             # rotas simples sem controller separado
  config/
    mongo.ts / redis.ts
```

## Tenant (multi-app)
Todos os recursos usam `appKey` como identificador de tenant.
UUID v4 via `crypto.randomUUID()` para IDs globais.

## Porta padrão
- Dev local: `PORT=3001` (3000 reservado para live server do m-bva)
- Prod: `PORT=3000`

## Variáveis de ambiente
```
MONGODB_URI=mongodb://localhost:27017/mmanage-dev
REDIS_URL=redis://localhost:6380
PORT=3001
NODE_ENV=development
```
