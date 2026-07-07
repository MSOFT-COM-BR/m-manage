# S016 — Fix: CORS bloqueava m-bva silenciosamente (whitelist fixa + m-manage.local mDNS)

**Status:** Done
**Módulo:** infra / cors
**Prioridade:** CRÍTICA
**Data:** 2026-07-07

---

## Problema

Dois sintomas relacionados, encontrados na mesma sessão de debug:

1. `index.html` (m-bva) exibia "Não foi possível carregar os produtos do banco de dados" mesmo com o m-manage online, saudável, respondendo `200` via `curl`.
2. `portal.html` (m-bva) travava/falhava no login (`POST http://m-manage.local/auth/login`), servido em `http://localhost:3002/portal`.

## Causa raiz 1 — whitelist de CORS fixa por porta

O container roda `src/index.ts` (`CMD ["bun", "run", "src/index.ts"]` no Dockerfile), não `src/app.ts`. Com `NODE_ENV=production`, `isDev` é `false` e o CORS usava uma whitelist fixa de origens exatas (string match), sem cobrir toda porta de dev local possível. Cada nova ferramenta/porta local (`:3002`, `:5500`, `:9999`, ...) exigia adicionar mais uma entrada manualmente — foi corrigido uma vez para `:5500` e imediatamente quebrou de novo com `:3002`.

Quando a origem não batia, o `@elysiajs/cors` corretamente omitia `Access-Control-Allow-Origin`. O servidor ainda respondia `200`/`401` com corpo completo (por isso `curl` "funcionava"), mas o navegador bloqueava a leitura da resposta — `fetch()` cai no `catch` com erro genérico de rede.

`src/app.ts` tinha uma whitelist diferente e parece ser um entrypoint morto (não é o `CMD` do Dockerfile) — fonte de confusão para debug futuro, não removido nesta story.

## Causa raiz 2 — `m-manage.local` sofre timeout de mDNS no macOS

`portal.html` apontava `BVA_API` para `http://m-manage.local` (diferente de `index.html`, que já usava `http://localhost`). No macOS, domínios `.local` são resolvidos via mDNS/Bonjour primeiro (`scutil --dns` mostra `options: mdns`, `timeout: 5`), **antes** de consultar `/etc/hosts` — mesmo com a entrada `127.0.0.1 m-manage.local` presente. Toda requisição a `m-manage.local` sofre ~5s de atraso esperando o mDNS falhar. No navegador isso aparenta travamento/timeout do login.

## Fix aplicado

1. **`src/index.ts`** — troca da whitelist fixa por função de validação com regex: qualquer origem `http(s)://(localhost|127.0.0.1|m-manage.local)(:porta)?` é aceita automaticamente; domínios de produção continuam em lista exata (`PROD_ORIGINS`).
   ```ts
   const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|m-manage\.local)(:\d+)?$/;
   origin: isDev ? true : (request) => {
       const origin = request.headers.get('origin') ?? '';
       return PROD_ORIGINS.includes(origin) || LOCAL_ORIGIN_RE.test(origin);
   }
   ```
2. **`portal.html`** — `BVA_API` trocado de `http://m-manage.local` para `http://localhost`, alinhado com `index.html`, eliminando o atraso de mDNS.

## Atualização 2026-07-07 — proxy local m-bva

A solução operacional final no stack Docker/Traefik passou a evitar chamada direta do navegador para `m-manage.local`: o `m-bva` usa `${window.location.origin}/api` quando aberto em `http://m-bva.local`, e o Traefik encaminha `Host(m-bva.local) && PathPrefix(/api)` para o serviço `m-manage` com `StripPrefix(/api)`.

Isso resolve simultaneamente:

- `/portal` não deve depender de `m-manage.local` no browser, evitando timeout mDNS.
- Chamadas da vitrine/portal ficam same-origin (`m-bva.local/api`), evitando CORS no fluxo principal.
- `http://localhost:3000` continua exposto para testes diretos e execução fora do Traefik.

Também foi identificado e corrigido no `m-bva`: o container usava `serve -s`, que devolvia `index.html` para `/portal`; agora `server.mjs` serve `/portal` como `portal.html`.

Em seguida, `server.mjs` também passou a bloquear `src/data/*.json` com HTTP 403 para garantir que o `m-bva` consuma apenas dados persistidos na API/banco em runtime.

## Diagnóstico (para próxima vez)

Sintoma "funciona no curl mas não no navegador com erro genérico de rede" → suspeitar de CORS:
```bash
curl -s -D - -o /dev/null "http://localhost/products?appKey=bva" -H "Origin: <origem-do-navegador>" | grep -i access-control-allow-origin
```
Vazio = origem bloqueada.

Sintoma "trava por vários segundos antes de falhar, especificamente com host `.local`" → suspeitar de mDNS:
```bash
scutil --dns | grep -A3 "domain.*local"   # confirma options: mdns
curl --resolve m-manage.local:80:127.0.0.1 http://m-manage.local/health   # bypassa mDNS, testa se é isso mesmo
```

## Débito Técnico Identificado

`src/app.ts` parece ser um entrypoint morto (define `app` mas não é o `CMD` do Dockerfile) com CORS divergente do `src/index.ts` real — não removido nesta story por não ter sido o escopo pedido.

## Arquivos Modificados

- `m-manage/src/index.ts` — CORS por regex em vez de whitelist fixa
- `m-bva/portal.html` — `BVA_API` contextual com `/api` same-origin em `m-bva.local`
- `m-bva/index.html` — mesmo resolvedor contextual de API
- `m-bva/server.mjs` — roteamento multipágina correto para `/portal` e `/prospeccao`
- `docker-compose.yml` — proxy Traefik `m-bva.local/api/*` para `m-manage`

## Critério de Aceite

- `Origin: http://localhost:3002` (porta real do bug reportado) → `Access-Control-Allow-Origin` presente ✅
- Qualquer porta nova de `localhost`/`127.0.0.1` → aceita automaticamente, sem precisar editar whitelist ✅
- `Origin: https://evil.com` → continua bloqueada (nenhum header CORS) ✅
- Login via `portal.html` não sofre mais atraso de mDNS (usa `localhost`, não `.local`) ✅
