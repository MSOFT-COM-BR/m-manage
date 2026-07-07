# Coding Standards — m-manage

## Regras imutáveis
1. Cada módulo em `src/modules/<nome>/` com `index.ts` + `<nome>.controller.ts`
2. Modelos em `src/models/m<Nome>.ts` com interface `I<Nome> extends Document`
3. Toda coleção usa `appKey` (tenant) + `uuid` (UUID v4 imutável)
4. Registrar `.use(xRoutes)` no `src/index.ts`
5. SDD obrigatório antes de implementar: `docs/stories/S<NNN>-titulo.md`

## Padrão de resposta
```ts
{ success: true, data: ... }
{ success: false, error: 'mensagem' }
{ success: true, data: [...], pagination: { page, limit, total, pages } }
```

## Erros HTTP
- 400 — validação / campo obrigatório ausente
- 401 — não autenticado
- 404 — recurso não encontrado
- 409 — duplicado (uuid ou slug único)
- 500 — erro interno (logar `error.message`)

## Soft delete
Padrão: mudar `status → 'archived'`. Hard delete em endpoint separado `/hard`.

## UUID
Sempre `crypto.randomUUID()` — nativo, zero deps, imutável após criação.

## Slug
`name.toLowerCase().normalize('NFD').replace(...)` — gerado automaticamente se não fornecido.

## Sem comentários
Código auto-documentado. Comentar apenas invariantes não-óbvias.
