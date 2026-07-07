# S017 — Infra: Upgrade Elysia 1.4, Traefik Local e Higiene do Repositório

**Status:** Done
**Módulo:** infra
**Data:** 2026-07-07

---

## O que foi feito

Mudanças de infraestrutura acumuladas durante as stories S003–S016, consolidadas aqui:

### Dependências

- **Elysia `0.8.17` → `1.4.29`** (major) — exigido pelas versões atuais de `@elysiajs/cors` e pelos padrões de plugin usados nos middlewares de tenant.
- Novas dependências: `jsonwebtoken` (S003), `@sinclair/typebox` (validação de schemas).
- Lockfile migrado de `bun.lockb` (binário) para `bun.lock` (texto) — diffs legíveis em code review.
- Novos scripts de seed: `seed:bva-erp`, `seed:bva-prospects`, `seed:users`.

### Docker Compose com Traefik local

- `docker-compose.yml` e `docker-compose.dev.yml` ganharam serviço **Traefik** como reverse proxy local (config em `traefik/dynamic.yml`), roteando `m-manage.local` e o proxy same-origin `/api` do m-bva (ver S016).
- MongoDB e a API deixaram de publicar portas no host (`ports:` → `expose:`) — todo acesso externo passa pelo Traefik na porta 80.
- **Traefik fixado em `v3.7`**: versões ≤ v3.5 usam API Docker 1.24 hardcoded e falham com 404 em Docker 29+/OrbStack.

### Higiene do repositório

- `.gitignore` passou a excluir `dist/` (build), `uploads/` (arquivos de runtime do `uploadService`), `pnpm-lock.yaml` (lockfile órfão — o projeto usa Bun) e estado local do AIOX.

## Critério de Aceite

- `docker compose up -d` sobe Traefik + MongoDB + Redis + API sem portas conflitando com o stack raiz do m-setup.
- `bun install` resolve pelo `bun.lock` texto; nenhum `bun.lockb` no repositório.
- `git status` limpo após build (`dist/`) e upload de arquivos (`uploads/`).
