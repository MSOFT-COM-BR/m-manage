# S018 — Uploads e anexos em storage S3 (MinIO s3.mirandasoft.com.br)

**Status:** Done
**Módulo:** infra / uploads
**Prioridade:** Alta
**Data:** 2026-07-09

---

## Contexto

Uploads (fotos de produto ERP e anexos) eram gravados no disco local do container (`uploads/`, volume Docker `m_manage_uploads`) e servidos pela rota `GET /uploads/*`. Isso amarra os arquivos ao host, complica backup e não escala para múltiplas réplicas. O objetivo é persistir tudo no storage S3-compatible da MirandaSoft (`https://s3.mirandasoft.com.br`, path-style).

## Solução

Bun tem cliente S3 nativo (`Bun.S3Client`) — **nenhuma dependência nova**.

1. **`src/config/s3.ts`** (novo) — cliente S3 configurado por env. Se `AWS_ENDPOINT`/`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` não estiverem definidos, `s3` é `null` e tudo cai no disco local (dev continua funcionando sem MinIO). `AWS_USE_PATH_STYLE_ENDPOINT=true` é o default do Bun (`virtualHostedStyle: false`); só vira virtual-hosted se a var for explicitamente `false`.

2. **`src/services/uploadService.ts`** — `saveUpload`/`saveAnyUpload` gravam no S3 via `persist()` compartilhado (key = `subdir/filename`, content-type preservado). **As URLs continuam `/uploads/subdir/arquivo`** — nada muda no banco nem nos consumidores (erp.controller checa `url?.startsWith('/uploads/')` antes de deletar, segue válido). `deleteUpload` apaga do S3 e também do disco local (limpa legado). Novo helper `readUpload(rel)` busca S3 primeiro, cai para disco local (arquivos pré-migração), bloqueia `..` (traversal).

3. **`src/index.ts`** — rota `GET /uploads/*` usa `readUpload`; mantém `Cache-Control: immutable`, `Content-Disposition: attachment` para caminhos `/attachments/`, e o content-type vem do `stat()` do objeto S3 (MinIO preserva o type enviado no write).

## Variáveis de ambiente (adicionadas em `.env`, `.env.example`, `.env.production.example`)

```env
AWS_DEFAULT_REGION=us-east-1
AWS_ENDPOINT=https://s3.mirandasoft.com.br
AWS_USE_PATH_STYLE_ENDPOINT=true
AWS_ACCESS_KEY_ID=        # preencher — vazio desativa S3 (fallback disco)
AWS_SECRET_ACCESS_KEY=    # preencher
AWS_BUCKET=m-manage       # bucket precisa existir no MinIO
```

O compose raiz já passa o `.env` inteiro via `env_file: ./apps/m-manage/.env` — nenhuma mudança de compose necessária. O volume `m_manage_uploads` pode ser mantido durante a transição (serve os arquivos legados via fallback).

## Verificação executada

Smoke test com MinIO descartável local (`minio/minio` + bucket `m-manage`):

- `saveAnyUpload` → objeto criado no bucket com content-type correto ✅
- `readUpload` → conteúdo íntegro de volta do S3 ✅
- `deleteUpload` → objeto removido do bucket ✅
- Rota `GET /uploads/...` servindo do S3 com `Content-Type`, `Cache-Control` e `Content-Disposition: attachment` (em `/attachments/`) ✅
- Arquivo inexistente → 404 ✅
- Arquivo legado só em disco (`uploads/erp/bva/*.png`) → 200 via fallback ✅
- Path traversal (`../package.json`) → bloqueado ✅
- Sem credenciais no env → grava/lê/deleta em disco local como antes ✅
- `bun build` OK; `tsc --noEmit` sem erros novos nos arquivos tocados ✅

## Atualização 2026-07-09 — bucket por tenant (bva → studio-bva) — **REVERTIDO em 2026-07-10 (ver S019)**

Uploads do tenant **bva** vão para o bucket **`studio-bva`**; o restante continua no bucket padrão (`AWS_BUCKET`, default `m-manage`). Implementado via `bucketFor(relPath)` em `src/config/s3.ts`: o appKey está no caminho (`erp/<appKey>/...`), então se algum **segmento de diretório** for `bva`, resolve para `AWS_BUCKET_BVA` (default `studio-bva`) — nome de arquivo não conta (`erp/outro/bva.png` fica no padrão). O Bun.S3Client aceita `{ bucket }` por operação, então um único cliente atende os dois buckets. `saveUpload`/`saveAnyUpload`, `readUpload` e `deleteUpload` usam o resolvedor.

Nova env: `AWS_BUCKET_BVA=studio-bva` (nos três arquivos de env). O bucket `studio-bva` precisa existir no MinIO.

Verificado com MinIO local e os dois buckets: `erp/bva/attachments/*` gravado/lido/deletado no `studio-bva`; `erp/healthtech/attachments/*` no `m-manage`; resolvedor testado para os quatro casos de caminho.

## Atualização 2026-07-09 (tarde) — endpoint real, Bun 1.2+ obrigatório e migração concluída

**Endpoint da API S3: `https://s3.mirandasoft.com.br`** (porta 9000 do MinIO). `https://storage.mirandasoft.com.br` é o **Console** (porta 9001) — requisições S3 nele retornam `InvalidArgument: S3 API Requests must be made to API port`. O domínio está atrás do Cloudflare, que não encaminha a porta 9000, então a API precisa de domínio próprio roteado no proxy de origem.

**Incidente: uploads do bva não chegavam ao S3.** Causa dupla no container `m-setup-m-manage-1`: (1) imagem construída antes do código S3 e sem as vars AWS; (2) ao reconstruir, crash na inicialização — `oven/bun:1.1.38-alpine` não tem `Bun.S3Client` (**requer Bun >= 1.2**). Fix: `Dockerfile` e `Dockerfile.dev` atualizados para `oven/bun:1.3-alpine` + rebuild. **Sempre reconstruir o container após mudanças que dependem do runtime.**

**Migração concluída:** os 6 arquivos legados do volume `m_manage_uploads` (fotos e anexos `erp/bva/*`, 14 MiB) foram espelhados para o bucket `studio-bva` via `mc mirror`. Verificado upload real de dentro do container → objeto no `studio-bva` → servido de volta pela rota `/uploads/*`; arquivos migrados servindo 200 com content-type correto. O bucket `m-manage` foi criado no MinIO (não existia). O volume local agora é só redundância — pode ser removido do compose no futuro.

## Atualização 2026-07-09 (noite) — MinIO recriado no Dokploy; chaves rotacionadas

Upload pelo portal bva voltou a falhar com `an unexpected error has occurred` (mensagem genérica do `S3Error` do Bun vazando pelo `catch` do erp.controller). Causa: **a instância MinIO foi recriada (agora gerida pelo Dokploy — bucket `dokploy-s3` presente)**, o que apagou todos os buckets antigos (`studio-bva`, `m-notas`) e invalidou a access key anterior. O `.env` foi atualizado com as chaves novas, mas o **container só lê o `env_file` na criação** — seguia com a chave morta (`InvalidAccessKeyId`).

Fix executado: bucket `studio-bva` recriado; os 6 arquivos re-espelhados a partir do volume `m_manage_uploads` (o fallback local salvou a migração — mirror copia, não move); container recriado com `docker compose up -d --force-recreate m-manage` (na **raiz do m-setup**). Verificado: upload de dentro do container → `studio-bva` → 6 URLs servindo 200 via `m-bva.local/api`.

**Lições:** (1) trocar credencial/endpoint no `.env` exige `--force-recreate` do container; (2) recriar o MinIO no painel apaga buckets — manter o volume local como redundância até o S3 ter backup; (3) erro genérico "an unexpected error has occurred" em upload = exceção S3 do Bun; reproduzir com script dentro do container para ver o `e.code` real.

## Arquivos Modificados

- `src/config/s3.ts` — novo, cliente Bun.S3Client por env
- `src/services/uploadService.ts` — persist S3 + fallback local, `readUpload`, delete em ambos
- `src/index.ts` — rota `/uploads/*` via `readUpload`
- `.env`, `.env.example`, `.env.production.example` — vars AWS_*
- `Dockerfile`, `Dockerfile.dev` — base `oven/bun:1.3-alpine` (S3Client requer Bun >= 1.2)
