# S019 — Storage S3 exclusivo: ler do bucket de prod, nunca salvar na API

**Status:** Done
**Módulo:** infra / uploads
**Prioridade:** Alta
**Data:** 2026-07-10
**Depende de:** S018 (uploads em S3 com fallback local)

---

## Contexto

A S018 implementou uploads no S3 (MinIO `s3.mirandasoft.com.br`) mas manteve o disco local como **fallback** em três pontos: gravação quando as credenciais não estão configuradas, leitura de arquivos legados e deleção redundante. Isso significa que, num ambiente mal configurado, arquivos podem silenciosamente ficar salvos dentro do container da API — exatamente o que não pode acontecer: o container é efêmero, não escala e já causou confusão (arquivos "presos" no volume enquanto o S3 ficava vazio).

**Requisito:** imagens e anexos são lidos **direto do bucket de produção**; a API **nunca** persiste arquivo em disco local. Upload sem S3 configurado deve falhar alto, não cair em fallback silencioso.

## Decisões

1. **Gravação: S3 obrigatório.** `persist()` sem cliente S3 configurado lança erro claro (`Storage S3 não configurado...`) — o endpoint retorna 400 com a mensagem em vez de salvar localmente.
2. **Leitura: só do bucket.** `readUpload()` consulta apenas o S3 (bucket resolvido por `bucketFor()` — `studio-bva` para bva, `m-manage` para o resto). O fallback de disco foi removido: todos os arquivos legados já foram migrados na S018 (6 arquivos, verificados servindo do bucket).
3. **Deleção: só no bucket.** Sem tentativa de apagar arquivo local.
4. **Volume `m_manage_uploads` desmontado** do serviço `m-manage` no compose raiz (e do compose standalone do m-manage). O volume Docker em si **não foi apagado** — permanece como backup congelado dos arquivos legados até existir rotina de backup do MinIO; para removê-lo de vez: `docker volume rm m-setup_m_manage_uploads`.
5. A rota `GET /uploads/*` continua existindo com as mesmas URLs (`/uploads/subdir/arquivo`) — compatibilidade total com o que está no Mongo e com o frontend (`${BVA_API}${url}`) — mas o comportamento é híbrido:
   - **Imagens** (qualquer caminho fora de `/attachments/`): **redirect `302` para URL presignada do bucket** (1h de validade; redirect com `Cache-Control: private, max-age=300`). O navegador baixa **direto do `s3.mirandasoft.com.br`** — a banda não passa pela API.
   - **Anexos** (`/attachments/`): streaming pela API com `Content-Disposition: attachment` (download forçado), porque a URL presignada do Bun não assina `response-content-disposition`. Volume baixo (downloads eventuais), não pesa na API.

## Mudanças

- `src/services/uploadService.ts` — removidos todos os caminhos de disco (`Bun.write` local, `mkdir`, leitura/deleção local). `persist`/`readUpload`/`deleteUpload` operam apenas no S3; sem S3 configurado: upload lança erro, leitura retorna 404, deleção lança erro. Novo `presignUpload(rel)` gera a URL presignada de leitura.
- `src/index.ts` — rota `GET /uploads/*` híbrida: 302 presignado para imagens, streaming com `attachment` para `/attachments/`.
- `docker-compose.yml` (raiz do m-setup) — removido o mount `m_manage_uploads:/app/uploads` do serviço `m-manage` e a declaração do volume.
- `apps/m-manage/docker-compose.yml` (standalone) — idem para o volume `uploads`.

## Descoberta durante a verificação: HEAD instável atrás do proxy

O `stat()` do Bun (HTTP HEAD) falhava esporadicamente na **primeira** chamada (`S3Error UnknownError: an unexpected error has occurred`) e funcionava nas seguintes — flakiness na cadeia Cloudflare → proxy Dokploy → MinIO. Como o `readUpload` dependia de `stat()` antes do stream, um arquivo existente podia responder 404 aleatoriamente.

**Fix:** `readUpload` não usa mais HEAD. Faz um único **GET presignado** (`s3.presign` + `fetch`, com 1 retry para erro de rede) e extrai `content-type`/`content-length` dos headers da resposta — mais estável e uma ida a menos ao storage.

Nota de teste: GETs presignados de PNG podem ser cacheados pelo Cloudflare; duas chamadas no mesmo segundo geram URL idêntica e a segunda pode vir do cache (visto como "objeto ainda existe" logo após delete). Irrelevante no app (arquivos imutáveis com nome UUID), mas explica falsos negativos em testes de delete — confirmar deleção via `list`, não via GET imediato.

## Verificação executada

- Upload de dentro do container → objeto no bucket `studio-bva`; **`/app/uploads` nem existe no container** (volume desmontado, nada persistido localmente) ✅
- 3 ciclos upload → leitura → delete sem flakiness (leitura via GET presignado) ✅
- Delete confirmado via `list` (0 objetos) e GET direto 404 ✅
- Imagem via `m-bva.local/api/uploads/erp/bva/*.png` → `302` com `Location` presignado no bucket; seguindo o redirect, 200 `image/png` direto de `s3.mirandasoft.com.br` ✅
- Anexo via `.../attachments/*.3mf` → 200 pela API com `Content-Disposition: attachment` ✅
- Arquivo inexistente → 404 ✅
- Sem credenciais S3 no env: upload lança erro claro (400 com mensagem, sem gravar em disco); leitura retorna 404 ✅
- `tsc --noEmit` sem erros novos; container rebuild + healthy ✅

## Atualização 2026-07-10 — bucket único (fim do bucket por tenant)

O bucket por tenant da S018 (`bva` → `studio-bva` via `bucketFor()`) foi removido: **tudo vive em `AWS_BUCKET=m-manage`**, com o tenant separado pelo prefixo do caminho (`erp/bva/...`), que já existia. `bucketFor()`/`S3_BUCKET_BVA`/`AWS_BUCKET_BVA` deixaram de existir; o `S3Client` usa apenas o bucket default.

Migração: os 7 objetos do `studio-bva` foram espelhados para `m-manage` (mesmas keys — URLs do Mongo intactas). O bucket `studio-bva` ficou para trás como cópia congelada; pode ser removido no MinIO quando quiser (`mc rb --force r/studio-bva`).

Verificado após rebuild: imagem → 302 para `https://s3.mirandasoft.com.br/m-manage/erp/bva/...` e 200 no download; anexo → 200 com `attachment`; upload novo confirmado no bucket `m-manage` via `list`; delete OK; typecheck limpo.

## Rollback

Reverter este commit e remontar o volume no compose. Os dados legados continuam no volume `m_manage_uploads` (não foi apagado) e no bucket.
